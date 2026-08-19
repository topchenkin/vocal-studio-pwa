"""Upload the Demucs API to the Moscow VPS. Requires UVS_SSH_PASS."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import paramiko

HOST = os.environ.get("UVS_SSH_HOST", "5.42.123.142")
PASSWORD = os.environ.get("UVS_SSH_PASS", "")
ROOT = Path(__file__).resolve().parents[1]
AI = ROOT / "deploy" / "ai-api"
ENV_LOCAL = ROOT / ".env.local"


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


def env_file_bytes() -> bytes:
    local = local_env()
    url = local.get("NEXT_PUBLIC_SUPABASE_URL") or local.get("SUPABASE_URL") or ""
    lines = [
        "BIND=127.0.0.1",
        "PORT=8788",
        f"SUPABASE_URL={url}",
        f"SUPABASE_SERVICE_ROLE_KEY={local.get('SUPABASE_SERVICE_ROLE_KEY', '')}",
        f"HUGGINGFACE_API_KEY={local.get('HUGGINGFACE_API_KEY', '')}",
        f"DEMUCS_HF_SPACE={local.get('DEMUCS_HF_SPACE', 'abidlabs/music-separation')}",
        "PROXY_PUBLIC_ORIGIN=https://sb.uniquevocal.ru",
        "",
    ]
    return "\n".join(lines).encode("utf-8")


def main() -> None:
    if not PASSWORD:
        raise SystemExit("UVS_SSH_PASS is not set")
    server = (AI / "server.mjs").read_bytes().replace(b"\r\n", b"\n")
    unit = (AI / "ai-api.service").read_bytes().replace(b"\r\n", b"\n")
    env = env_file_bytes()
    if b"SUPABASE_SERVICE_ROLE_KEY=\n" in env or b"HUGGINGFACE_API_KEY=\n" in env:
        raise SystemExit("missing SUPABASE_SERVICE_ROLE_KEY or HUGGINGFACE_API_KEY in .env.local")

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
        run(client, "mkdir -p /opt/ai-api /etc/uniquevocal")
        sftp = client.open_sftp()
        try:
            with sftp.file("/opt/ai-api/server.mjs", "wb") as fh:
                fh.write(server)
            with sftp.file("/etc/systemd/system/ai-api.service", "wb") as fh:
                fh.write(unit)
            with sftp.file("/etc/uniquevocal/ai-api.env", "wb") as fh:
                fh.write(env)
        finally:
            sftp.close()
        run(client, "chown -R www-data:www-data /opt/ai-api")
        run(client, "chown root:www-data /etc/uniquevocal/ai-api.env && chmod 640 /etc/uniquevocal/ai-api.env")
        run(client, "systemctl daemon-reload")
        run(client, "systemctl enable --now ai-api")
        run(client, "systemctl restart ai-api")
        run(client, "systemctl is-active ai-api")
        run(client, "curl -sS -m 8 http://127.0.0.1:8788/api/ai/__health; echo")
    finally:
        client.close()
    print("ai-api deployed", flush=True)


if __name__ == "__main__":
    main()
