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
            "echo RUNTIME; /opt/vocal-worker/.venv/bin/python --version; "
            "/opt/vocal-worker/.venv/bin/python -m pip show "
            "gradio-client librosa numba numpy llvmlite requests scipy soundfile "
            "| grep -E '^(Name|Version):'; "
            "echo AVAILABLE_PYTHONS; "
            "for p in python3.11 python3.12 python3.13 python3.14; do "
            "command -v $p >/dev/null && $p --version; done; "
            "echo OWNERSHIP; "
            "stat -c '%U:%G %a %n' /opt/vocal-worker /opt/vocal-worker/.venv "
            "/etc/uniquevocal/vocal-worker.env 2>/dev/null; "
            "echo UNIT; systemctl show vocal-worker "
            "-p User -p Group -p ProtectSystem -p ReadWritePaths "
            "-p Environment --no-pager; "
            "echo CACHE; "
            "stat -c '%U:%G %a %n' /var/cache/vocal-worker "
            "/var/cache/vocal-worker/numba 2>/dev/null; "
            "echo LOGS; "
            "journalctl -u vocal-worker -n 30 --no-pager; "
            "echo JOBS; "
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
