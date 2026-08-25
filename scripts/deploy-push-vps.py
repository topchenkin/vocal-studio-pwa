"""Upload the Web Push dispatcher to the Moscow VPS. Requires UVS_SSH_PASS."""
from __future__ import annotations

import os
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
PUSH = ROOT / "deploy" / "push-api"
ENV_LOCAL = ROOT / ".env.local"


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 180) -> None:
    print(f">>> {cmd}", flush=True)
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if out:
        print(out[-8000:], flush=True)
    if err:
        print(err[-4000:].encode("utf-8", "replace").decode("utf-8"), flush=True)
    if code != 0:
        raise SystemExit(f"remote command failed ({code}): {cmd}")


def local_env() -> dict[str, str]:
    values: dict[str, str] = {}
    if not ENV_LOCAL.is_file():
        return values
    for raw in ENV_LOCAL.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


LOCAL = local_env()
HOST = os.environ.get("UVS_SSH_HOST") or LOCAL.get("UVS_SSH_HOST", "5.42.123.142")
PASSWORD = os.environ.get("UVS_SSH_PASS") or LOCAL.get("UVS_SSH_PASS", "")


def env_file_bytes() -> bytes:
    local = local_env()
    url = local.get("NEXT_PUBLIC_SUPABASE_URL") or local.get("SUPABASE_URL") or ""
    lines = [
        "BIND=127.0.0.1",
        "PORT=8789",
        f"SUPABASE_URL={local.get('SELFHOST_SUPABASE_URL') or url}",
        f"SUPABASE_SERVICE_ROLE_KEY={local.get('SUPABASE_SERVICE_ROLE_KEY', '')}",
        f"NEXT_PUBLIC_VAPID_PUBLIC_KEY={local.get('NEXT_PUBLIC_VAPID_PUBLIC_KEY', '')}",
        f"VAPID_PRIVATE_KEY={local.get('VAPID_PRIVATE_KEY', '')}",
        f"VAPID_SUBJECT={local.get('VAPID_SUBJECT', 'mailto:iris.jar008@gmail.com')}",
        "NEXT_PUBLIC_APP_URL=https://www.uniquevocal.ru",
        "",
    ]
    return "\n".join(lines).encode("utf-8")


def main() -> None:
    if not PASSWORD:
        raise SystemExit("UVS_SSH_PASS is not set")
    env = env_file_bytes()
    if (
        b"SUPABASE_SERVICE_ROLE_KEY=\n" in env
        or b"VAPID_PRIVATE_KEY=\n" in env
        or b"NEXT_PUBLIC_VAPID_PUBLIC_KEY=\n" in env
    ):
        raise SystemExit("missing Supabase or VAPID keys in .env.local")

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
        run(client, "mkdir -p /opt/push-api /etc/uniquevocal")
        sftp = client.open_sftp()
        try:
            with sftp.file("/opt/push-api/server.mjs", "wb") as fh:
                fh.write((PUSH / "server.mjs").read_bytes().replace(b"\r\n", b"\n"))
            with sftp.file("/opt/push-api/package.json", "wb") as fh:
                fh.write((PUSH / "package.json").read_bytes().replace(b"\r\n", b"\n"))
            with sftp.file("/etc/systemd/system/push-api.service", "wb") as fh:
                fh.write(
                    (PUSH / "push-api.service").read_bytes().replace(b"\r\n", b"\n")
                )
            with sftp.file("/etc/uniquevocal/push-api.env", "wb") as fh:
                fh.write(env)
        finally:
            sftp.close()
        run(client, "chown -R www-data:www-data /opt/push-api")
        run(
            client,
            "chown root:www-data /etc/uniquevocal/push-api.env && chmod 640 /etc/uniquevocal/push-api.env",
        )
        run(
            client,
            "cd /opt/push-api && npm install --omit=dev --no-fund --no-audit",
        )
        run(client, "systemctl daemon-reload")
        run(client, "systemctl enable --now push-api")
        run(client, "systemctl restart push-api")
        run(client, "systemctl is-active push-api")
        run(client, "curl -sS -m 8 http://127.0.0.1:8789/health; echo")
    finally:
        client.close()
    print("push-api deployed", flush=True)


if __name__ == "__main__":
    main()
