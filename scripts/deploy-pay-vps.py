"""Upload Robokassa pay-api, apply SQL, reload Caddy env. Requires UVS_SSH_PASS."""
from __future__ import annotations

import os
from pathlib import Path

import paramiko

HOST = os.environ.get("UVS_SSH_HOST", "5.42.123.142")
PASSWORD = os.environ.get("UVS_SSH_PASS", "")
ROOT = Path(__file__).resolve().parents[1]
PAY = ROOT / "deploy" / "pay-api"
SQL = ROOT / "supabase-migrations" / "2026-08-21-robokassa-confirm.sql"
GIFT_SQL = ROOT / "supabase-migrations" / "2026-08-22-gift-certificates.sql"
ENV_LOCAL = ROOT / ".env.local"


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 180) -> None:
    print(f">>> {cmd}", flush=True)
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if out:
        print(out[-8000:].encode("utf-8", "replace").decode("ascii", "replace"), flush=True)
    if err:
        print(err[-4000:].encode("utf-8", "replace").decode("ascii", "replace"), flush=True)
    if code != 0:
        raise SystemExit(f"remote command failed ({code}): {cmd}")


def local_env() -> dict[str, str]:
    values: dict[str, str] = {}
    if ENV_LOCAL.is_file():
        for raw in ENV_LOCAL.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
    for key, value in os.environ.items():
        if key.startswith("ROBOKASSA_") or key in {
            "UVS_SSH_PASS",
            "SUPABASE_SERVICE_ROLE_KEY",
            "SELFHOST_SUPABASE_URL",
            "NEXT_PUBLIC_SUPABASE_URL",
            "SUPABASE_URL",
        }:
            if value:
                values[key] = value
    return values


def env_file_bytes() -> bytes:
    local = local_env()
    url = (
        local.get("SELFHOST_SUPABASE_URL")
        or local.get("SUPABASE_URL")
        or local.get("NEXT_PUBLIC_SUPABASE_URL")
        or ""
    )
    required = [
        "ROBOKASSA_PASS1",
        "ROBOKASSA_PASS2",
        "ROBOKASSA_TEST_PASS1",
        "ROBOKASSA_TEST_PASS2",
        "SUPABASE_SERVICE_ROLE_KEY",
    ]
    missing = [key for key in required if not local.get(key)]
    if missing or not url:
        raise SystemExit(f"missing env: {', '.join(missing + ([] if url else ['SUPABASE_URL']))}")
    lines = [
        "BIND=127.0.0.1",
        "PORT=8791",
        f"SUPABASE_URL={url}",
        f"SUPABASE_SERVICE_ROLE_KEY={local['SUPABASE_SERVICE_ROLE_KEY']}",
        f"ROBOKASSA_MERCHANT_LOGIN={local.get('ROBOKASSA_MERCHANT_LOGIN', 'uniquevocal')}",
        f"ROBOKASSA_HASH={local.get('ROBOKASSA_HASH', 'md5')}",
        f"ROBOKASSA_IS_TEST={local.get('ROBOKASSA_IS_TEST', '1')}",
        f"ROBOKASSA_PASS1={local['ROBOKASSA_PASS1']}",
        f"ROBOKASSA_PASS2={local['ROBOKASSA_PASS2']}",
        f"ROBOKASSA_PASS3={local.get('ROBOKASSA_PASS3', '')}",
        f"ROBOKASSA_TEST_PASS1={local['ROBOKASSA_TEST_PASS1']}",
        f"ROBOKASSA_TEST_PASS2={local['ROBOKASSA_TEST_PASS2']}",
        "NEXT_PUBLIC_APP_URL=https://www.uniquevocal.ru",
        "",
    ]
    return "\n".join(lines).encode("utf-8")


def main() -> None:
    if not PASSWORD:
        raise SystemExit("UVS_SSH_PASS is not set")
    if not SQL.is_file():
        raise SystemExit(f"missing {SQL}")
    if not GIFT_SQL.is_file():
        raise SystemExit(f"missing {GIFT_SQL}")
    env = env_file_bytes()

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        HOST,
        username="root",
        password=PASSWORD,
        timeout=30,
        allow_agent=False,
        look_for_keys=False,
    )
    try:
        run(client, "mkdir -p /opt/pay-api /etc/uniquevocal /opt/uvs-migrate")
        sftp = client.open_sftp()
        try:
            with sftp.file("/opt/pay-api/server.mjs", "wb") as fh:
                fh.write((PAY / "server.mjs").read_bytes().replace(b"\r\n", b"\n"))
            with sftp.file("/opt/pay-api/package.json", "wb") as fh:
                fh.write((PAY / "package.json").read_bytes().replace(b"\r\n", b"\n"))
            with sftp.file("/etc/systemd/system/pay-api.service", "wb") as fh:
                fh.write((PAY / "pay-api.service").read_bytes().replace(b"\r\n", b"\n"))
            with sftp.file("/etc/uniquevocal/pay-api.env", "wb") as fh:
                fh.write(env)
            with sftp.file("/opt/uvs-migrate/robokassa.sql", "wb") as fh:
                fh.write(SQL.read_bytes().replace(b"\r\n", b"\n"))
            with sftp.file("/opt/uvs-migrate/gift-certificates.sql", "wb") as fh:
                fh.write(GIFT_SQL.read_bytes().replace(b"\r\n", b"\n"))
        finally:
            sftp.close()
        run(client, "chown -R www-data:www-data /opt/pay-api")
        run(
            client,
            "chown root:www-data /etc/uniquevocal/pay-api.env && chmod 640 /etc/uniquevocal/pay-api.env",
        )
        run(
            client,
            "docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < /opt/uvs-migrate/robokassa.sql",
        )
        run(
            client,
            "docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < /opt/uvs-migrate/gift-certificates.sql",
        )
        run(client, "systemctl daemon-reload")
        run(client, "systemctl enable --now pay-api")
        run(client, "systemctl restart pay-api")
        run(client, "systemctl is-active pay-api")
        run(client, "curl -sS -m 8 http://127.0.0.1:8791/health; echo")
    finally:
        client.close()
    print("pay-api deployed", flush=True)


if __name__ == "__main__":
    main()
