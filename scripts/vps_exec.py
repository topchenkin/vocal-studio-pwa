"""Run a remote command on the Moscow VPS. Usage: py -3 scripts/vps_exec.py <timeout_s> <command>"""
from __future__ import annotations

import sys
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(__file__).with_name("_vps_exec.out")


def load_env() -> dict[str, str]:
    values: dict[str, str] = {}
    path = ROOT / ".env.local"
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def main() -> None:
    timeout = int(sys.argv[1])
    command = sys.argv[2]
    env = load_env()
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
        _, stdout, stderr = client.exec_command(command, timeout=timeout)
        text = stdout.read().decode("utf-8", "replace")
        err = stderr.read().decode("utf-8", "replace")
        code = stdout.channel.recv_exit_status()
    finally:
        client.close()
    OUT.write_text(
        f"exit={code}\n{text}\nSTDERR\n{err}",
        encoding="utf-8",
    )
    print(f"exit={code} wrote {OUT}", flush=True)
    if code != 0:
        raise SystemExit(code)


if __name__ == "__main__":
    main()
