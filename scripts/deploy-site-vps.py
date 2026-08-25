"""Upload static `out/` + Caddyfile to the Moscow VPS. Requires UVS_SSH_PASS."""
from __future__ import annotations

import io
import os
import sys
import tarfile
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "out"
CADDYFILE = ROOT / "deploy" / "sb-proxy" / "Caddyfile"
REMOTE_SITE = "/var/www/uniquevocal"


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


LOCAL_ENV = local_env()
HOST = os.environ.get("UVS_SSH_HOST") or LOCAL_ENV.get("UVS_SSH_HOST", "5.42.123.142")
PASSWORD = os.environ.get("UVS_SSH_PASS") or LOCAL_ENV.get("UVS_SSH_PASS", "")


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
    if not OUT.is_dir() or not (OUT / "index.html").is_file():
        raise SystemExit(f"missing static export at {OUT}")
    if not CADDYFILE.is_file():
        raise SystemExit(f"missing {CADDYFILE}")

    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        tar.add(OUT, arcname=".")
    archive = buf.getvalue()
    print(f"archive {len(archive)} bytes from {OUT}", flush=True)

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
        run(client, f"mkdir -p {REMOTE_SITE} /tmp")
        sftp = client.open_sftp()
        try:
            with sftp.file("/tmp/uniquevocal-out.tgz", "wb") as fh:
                fh.write(archive)
            with sftp.file("/etc/caddy/Caddyfile", "wb") as fh:
                fh.write(CADDYFILE.read_bytes().replace(b"\r\n", b"\n"))
        finally:
            sftp.close()
        run(
            client,
            f"rm -rf {REMOTE_SITE}.new && mkdir -p {REMOTE_SITE}.new "
            f"&& tar xzf /tmp/uniquevocal-out.tgz -C {REMOTE_SITE}.new "
            f"&& rm -rf {REMOTE_SITE} && mv {REMOTE_SITE}.new {REMOTE_SITE} "
            f"&& rm -f /tmp/uniquevocal-out.tgz",
        )
        run(client, f"caddy validate --config /etc/caddy/Caddyfile")
        run(client, "systemctl reload caddy || systemctl restart caddy")
        run(client, f"test -f {REMOTE_SITE}/index.html && ls {REMOTE_SITE}/_next/static/chunks | head")
    finally:
        client.close()
    print("deployed", flush=True)


if __name__ == "__main__":
    main()
