"""Apply Resend SMTP to vocal supabase-auth only. Usage: py -3 scripts/apply-auth-smtp.py <RESEND_API_KEY>"""
from __future__ import annotations

import sys
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
REMOTE = "/opt/uvs-migrate/apply-auth-smtp.py"
SCRIPT = ROOT / "scripts" / "_auth_smtp.py"
ENV_LOCAL = ROOT / ".env.local"


def local_env() -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in ENV_LOCAL.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 180) -> str:
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if out:
        print(out, flush=True)
    if err:
        print(err, flush=True)
    if code != 0:
        raise SystemExit(f"remote failed ({code}): {cmd}")
    return out


def main() -> None:
    if len(sys.argv) != 2 or not sys.argv[1].startswith("re_"):
        raise SystemExit("usage: py -3 scripts/apply-auth-smtp.py <RESEND_API_KEY>")
    key = sys.argv[1]
    env = local_env()
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        env.get("UVS_SSH_HOST", "5.42.123.142"),
        username="root",
        password=env["UVS_SSH_PASS"],
        timeout=30,
        allow_agent=False,
        look_for_keys=False,
    )
    try:
        sftp = client.open_sftp()
        try:
            sftp.put(str(SCRIPT), REMOTE)
        finally:
            sftp.close()
        run(client, f"python3 {REMOTE} {key}", timeout=180)
        run(
            client,
            "docker exec supabase-auth env | grep -E '^GOTRUE_(SMTP_HOST|SMTP_PORT|SMTP_ADMIN_EMAIL|SMTP_USER|MAILER_AUTOCONFIRM|PASSWORD_MIN_LENGTH|MAILER_TEMPLATES_RECOVERY|MAILER_EXTERNAL_HOSTS)='",
            timeout=30,
        )
        run(
            client,
            "docker ps --format '{{.Names}} {{.Status}}' | grep -E 'supabase-auth|family-supabase-auth'",
            timeout=20,
        )
    finally:
        client.close()


if __name__ == "__main__":
    main()
