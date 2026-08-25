"""Upload sb-proxy + Caddyfile to the Moscow VPS. Requires UVS_SSH_PASS."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
PROXY = ROOT / "deploy" / "sb-proxy"


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


LOCAL = local_env()
HOST = os.environ.get("UVS_SSH_HOST") or LOCAL.get("UVS_SSH_HOST", "5.42.123.142")
PASSWORD = os.environ.get("UVS_SSH_PASS") or LOCAL.get("UVS_SSH_PASS", "")


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 120) -> None:
    print(f">>> {cmd}", flush=True)
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if out:
        print(out[-8000:], flush=True)
    if err:
        print(err[-4000:], file=sys.stderr, flush=True)
    if code != 0:
        raise SystemExit(f"remote command failed ({code}): {cmd}")


def main() -> None:
    if not PASSWORD:
        raise SystemExit("UVS_SSH_PASS is not set")
    server = (PROXY / "server.mjs").read_bytes().replace(b"\r\n", b"\n")
    caddy = (PROXY / "Caddyfile").read_bytes().replace(b"\r\n", b"\n")

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
        sftp = client.open_sftp()
        try:
            with sftp.file("/opt/sb-proxy/server.mjs", "wb") as fh:
                fh.write(server)
            with sftp.file("/etc/caddy/Caddyfile", "wb") as fh:
                fh.write(caddy)
        finally:
            sftp.close()
        run(
            client,
            "grep -q uniquevocal.ru /etc/uniquevocal/sb-proxy.env || true; "
            "sed -i 's|^ALLOW_ORIGIN=.*|ALLOW_ORIGIN=https://www.uniquevocal.ru,https://uniquevocal.ru|' "
            "/etc/uniquevocal/sb-proxy.env",
        )
        run(client, "caddy validate --config /etc/caddy/Caddyfile")
        run(client, "systemctl restart sb-proxy")
        run(client, "systemctl reload caddy || systemctl restart caddy")
        run(client, "systemctl is-active sb-proxy caddy")
        run(client, "curl -sS -m 8 http://127.0.0.1:8787/__health; echo")
    finally:
        client.close()
    print("proxy deployed", flush=True)


if __name__ == "__main__":
    main()
