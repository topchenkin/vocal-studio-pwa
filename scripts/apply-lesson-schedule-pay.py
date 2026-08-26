"""Apply lesson schedule payment SQL on the VPS. Requires UVS_SSH_PASS."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
SQL = ROOT / "supabase-migrations" / "2026-08-26-lesson-schedule-pay.sql"


def local_env() -> dict[str, str]:
    values: dict[str, str] = {}
    path = ROOT / ".env.local"
    if not path.is_file():
        return values
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def run(client: paramiko.SSHClient, command: str, timeout: int = 120) -> None:
    print(f">>> {command}", flush=True)
    _, stdout, stderr = client.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if out:
        print(out[-4000:], flush=True)
    if err:
        print(err[-2000:], file=sys.stderr, flush=True)
    if code:
        raise SystemExit(f"remote command failed ({code}): {command}")


def main() -> None:
    env = local_env()
    password = os.environ.get("UVS_SSH_PASS") or env.get("UVS_SSH_PASS", "")
    if not password:
        raise SystemExit("UVS_SSH_PASS is not set")
    if not SQL.is_file():
        raise SystemExit(f"missing {SQL}")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        os.environ.get("UVS_SSH_HOST") or env.get("UVS_SSH_HOST", "5.42.123.142"),
        username="root",
        password=password,
        timeout=30,
        allow_agent=False,
        look_for_keys=False,
    )
    try:
        run(client, "mkdir -p /opt/uvs-migrate")
        sftp = client.open_sftp()
        try:
            sftp.put(str(SQL), f"/opt/uvs-migrate/{SQL.name}")
        finally:
            sftp.close()
        run(
            client,
            "docker exec -i supabase-db psql -U postgres -d postgres "
            f"-v ON_ERROR_STOP=1 < /opt/uvs-migrate/{SQL.name}",
        )
        print("lesson-schedule-pay sql applied", flush=True)
    finally:
        client.close()


if __name__ == "__main__":
    main()
