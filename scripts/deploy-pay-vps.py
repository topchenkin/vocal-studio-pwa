"""Upload YooKassa pay-api + SQL, reload service. Requires UVS_SSH_PASS."""
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
YK_SQL = ROOT / "supabase-migrations" / "2026-08-22-yookassa-confirm.sql"
GIFT_ADMIN_SQL = ROOT / "supabase-migrations" / "2026-08-22-gift-admin-actions.sql"
GIFT_SIGNUP_SQL = ROOT / "supabase-migrations" / "2026-08-22-gift-redeem-on-signup.sql"
SUB_SQL = ROOT / "supabase-migrations" / "2026-08-23-subscription-expiry.sql"
TEST_PAY_SQL = ROOT / "supabase-migrations" / "2026-08-23-test-payment.sql"
ENV_LOCAL = ROOT / ".env.local"


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 180) -> None:
    print(f">>> {cmd}", flush=True)
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if out:
        print(
            out[-8000:]
            .encode("utf-8", "replace")
            .decode("ascii", "replace"),
            flush=True,
        )
    if err:
        print(
            err[-4000:]
            .encode("utf-8", "replace")
            .decode("ascii", "replace"),
            flush=True,
        )
    if code != 0:
        raise SystemExit(f"remote failed ({code}): {cmd}")


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
        if key.startswith("YOOKASSA_") or key in {
            "PAYMENT_PROVIDER",
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
    missing: list[str] = []
    if not url:
        missing.append("SUPABASE_URL")
    if not local.get("SUPABASE_SERVICE_ROLE_KEY"):
        missing.append("SUPABASE_SERVICE_ROLE_KEY")
    shop_id = local.get("YOOKASSA_SHOP_ID", "")
    if not shop_id:
        missing.append("YOOKASSA_SHOP_ID")
    secret = local.get("YOOKASSA_SECRET_KEY", "")
    if not secret:
        missing.append("YOOKASSA_SECRET_KEY")
    agent_id = local.get("YOOKASSA_AGENT_ID", "")
    payout_secret = local.get("YOOKASSA_PAYOUT_SECRET_KEY", "") or secret
    if missing:
        raise SystemExit(f"missing env: {', '.join(missing)}")

    lines = [
        "BIND=127.0.0.1",
        "PORT=8791",
        "PAYMENT_PROVIDER=yookassa",
        f"SUPABASE_URL={url}",
        f"SUPABASE_SERVICE_ROLE_KEY={local['SUPABASE_SERVICE_ROLE_KEY']}",
        f"YOOKASSA_SHOP_ID={shop_id}",
        f"YOOKASSA_SECRET_KEY={secret}",
        f"YOOKASSA_IS_TEST={local.get('YOOKASSA_IS_TEST', '1')}",
        "NEXT_PUBLIC_APP_URL=https://www.uniquevocal.ru",
    ]
    if agent_id:
        lines.append(f"YOOKASSA_AGENT_ID={agent_id}")
    if payout_secret:
        lines.append(f"YOOKASSA_PAYOUT_SECRET_KEY={payout_secret}")
    lines.append("")
    return "\n".join(lines).encode("utf-8")


def main() -> None:
    local = local_env()
    password = PASSWORD or local.get("UVS_SSH_PASS", "")
    if not password:
        raise SystemExit("UVS_SSH_PASS is not set")
    for path in (SQL, GIFT_SQL, YK_SQL, GIFT_ADMIN_SQL, GIFT_SIGNUP_SQL, SUB_SQL, TEST_PAY_SQL):
        if not path.is_file():
            raise SystemExit(f"missing {path}")
    env = env_file_bytes()

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        HOST,
        username="root",
        password=password,
        timeout=30,
        allow_agent=False,
        look_for_keys=False,
    )
    try:
        run(client, "mkdir -p /opt/pay-api /etc/uniquevocal /opt/uvs-migrate")
        sftp = client.open_sftp()
        try:
            for name in ("server.mjs", "providers.mjs", "package.json"):
                src = PAY / name
                if not src.is_file():
                    continue
                with sftp.file(f"/opt/pay-api/{name}", "wb") as fh:
                    fh.write(src.read_bytes().replace(b"\r\n", b"\n"))
            unit = PAY / "pay-api.service"
            if unit.is_file():
                with sftp.file("/etc/systemd/system/pay-api.service", "wb") as fh:
                    fh.write(unit.read_bytes().replace(b"\r\n", b"\n"))
            with sftp.file("/etc/uniquevocal/pay-api.env", "wb") as fh:
                fh.write(env)
            with sftp.file("/opt/uvs-migrate/payment-confirm.sql", "wb") as fh:
                fh.write(SQL.read_bytes().replace(b"\r\n", b"\n"))
            with sftp.file("/opt/uvs-migrate/gift-certificates.sql", "wb") as fh:
                fh.write(GIFT_SQL.read_bytes().replace(b"\r\n", b"\n"))
            with sftp.file("/opt/uvs-migrate/yookassa-confirm.sql", "wb") as fh:
                fh.write(YK_SQL.read_bytes().replace(b"\r\n", b"\n"))
            with sftp.file("/opt/uvs-migrate/gift-admin-actions.sql", "wb") as fh:
                fh.write(GIFT_ADMIN_SQL.read_bytes().replace(b"\r\n", b"\n"))
            with sftp.file("/opt/uvs-migrate/gift-redeem-on-signup.sql", "wb") as fh:
                fh.write(GIFT_SIGNUP_SQL.read_bytes().replace(b"\r\n", b"\n"))
            with sftp.file("/opt/uvs-migrate/subscription-expiry.sql", "wb") as fh:
                fh.write(SUB_SQL.read_bytes().replace(b"\r\n", b"\n"))
            with sftp.file("/opt/uvs-migrate/test-payment.sql", "wb") as fh:
                fh.write(TEST_PAY_SQL.read_bytes().replace(b"\r\n", b"\n"))
        finally:
            sftp.close()
        run(client, "chown -R www-data:www-data /opt/pay-api")
        run(
            client,
            "chown root:www-data /etc/uniquevocal/pay-api.env && chmod 640 /etc/uniquevocal/pay-api.env",
        )
        for sql_name in (
            "payment-confirm.sql",
            "gift-certificates.sql",
            "yookassa-confirm.sql",
            "gift-admin-actions.sql",
            "gift-redeem-on-signup.sql",
            "subscription-expiry.sql",
            "test-payment.sql",
        ):
            run(
                client,
                f"docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < /opt/uvs-migrate/{sql_name}",
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
