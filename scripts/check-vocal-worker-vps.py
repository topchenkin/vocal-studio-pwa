"""Read-only production health check for the vocal exercise worker."""
from __future__ import annotations

from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    env: dict[str, str] = {}
    for raw in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            env[key.strip()] = value.strip().strip('"').strip("'")
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
        command = (
            "systemctl is-active vocal-worker; "
            "journalctl -u vocal-worker -n 30 --no-pager; "
            "docker exec supabase-db psql -U postgres -d postgres -Atc "
            "\"select status,count(*) from public.exercise_analysis_jobs "
            "group by status order by status\""
        )
        _, stdout, stderr = client.exec_command(command, timeout=120)
        output = stdout.read().decode("utf-8", "replace")
        error = stderr.read().decode("utf-8", "replace")
        code = stdout.channel.recv_exit_status()
        print(output)
        if error:
            print(error)
        if code:
            raise SystemExit(code)
    finally:
        client.close()


if __name__ == "__main__":
    main()
