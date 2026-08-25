"""Deploy the vocal scoring migration and worker. Requires UVS_SSH_PASS."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
WORKER = ROOT / "deploy" / "vocal-worker"
MIGRATION = ROOT / "supabase-migrations" / "2026-08-25-vocal-exercise-scoring.sql"
INSTALL_VENV = r"""
set -eu
mkdir -p /var/cache/vocal-worker/numba /var/cache/vocal-worker/mpl
PY=""
for cand in python3.13 python3.12 python3.11 python3; do
  if command -v "$cand" >/dev/null 2>&1; then
    PY=$(command -v "$cand")
    break
  fi
done
echo "USING $PY"
"$PY" --version
WANT=$("$PY" -c 'import sys; print("%d.%d" % sys.version_info[:2])')
HAVE=""
if [ -x /opt/vocal-worker/.venv/bin/python ]; then
  HAVE=$(/opt/vocal-worker/.venv/bin/python -c 'import sys; print("%d.%d" % sys.version_info[:2])' 2>/dev/null || true)
fi
if [ "$HAVE" != "$WANT" ]; then
  rm -rf /opt/vocal-worker/.venv
  "$PY" -m venv /opt/vocal-worker/.venv
fi
/opt/vocal-worker/.venv/bin/pip install --upgrade pip
/opt/vocal-worker/.venv/bin/pip install -r /opt/vocal-worker/requirements.txt
"""
SANDBOX_SMOKE = r"""
systemd-run --wait --pipe --collect \
  --uid=www-data --gid=www-data \
  --working-directory=/opt/vocal-worker \
  --property=ProtectSystem=strict \
  --property=ProtectHome=true \
  --property=PrivateTmp=true \
  --property='ReadWritePaths=/tmp /var/cache/vocal-worker' \
  --setenv=NUMBA_CACHE_DIR=/var/cache/vocal-worker/numba \
  --setenv=MPLCONFIGDIR=/var/cache/vocal-worker/mpl \
  /opt/vocal-worker/.venv/bin/python /opt/vocal-worker/smoke_test.py
"""


def local_env() -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def run(client: paramiko.SSHClient, command: str, timeout: int = 600) -> None:
    print(f">>> {command}", flush=True)
    _, stdout, stderr = client.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if output:
        encoding = sys.stdout.encoding or "utf-8"
        print(output[-6000:].encode(encoding, "replace").decode(encoding), flush=True)
    if error:
        encoding = sys.stderr.encoding or "utf-8"
        print(
            error[-4000:].encode(encoding, "replace").decode(encoding),
            file=sys.stderr,
            flush=True,
        )
    if code:
        raise SystemExit(f"remote command failed ({code})")


def main() -> None:
    env = local_env()
    password = os.environ.get("UVS_SSH_PASS") or env.get("UVS_SSH_PASS", "")
    if not password:
        raise SystemExit("UVS_SSH_PASS is not set")
    supabase_url = (
        env.get("SELFHOST_SUPABASE_URL")
        or env.get("NEXT_PUBLIC_SUPABASE_URL")
        or env.get("SUPABASE_URL", "")
    )
    service_key = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    hf_token = env.get("HUGGINGFACE_API_KEY", "")
    if not supabase_url or not service_key or not hf_token:
        raise SystemExit("Supabase/Hugging Face worker credentials are missing in .env.local")
    worker_env = "\n".join(
        [
            f"SUPABASE_URL={supabase_url}",
            f"SUPABASE_SERVICE_ROLE_KEY={service_key}",
            f"HUGGINGFACE_API_KEY={hf_token}",
            f"DEMUCS_HF_SPACE={env.get('DEMUCS_HF_SPACE', 'abidlabs/music-separation')}",
            "POLL_SECONDS=3",
            "PYTHONUNBUFFERED=1",
            "NUMBA_CACHE_DIR=/var/cache/vocal-worker/numba",
            "MPLCONFIGDIR=/var/cache/vocal-worker/mpl",
            "",
        ]
    ).encode()

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
        run(client, "mkdir -p /opt/vocal-worker /opt/uvs-migrate /etc/uniquevocal")
        sftp = client.open_sftp()
        try:
            for name in ("worker.py", "analyzer.py", "requirements.txt", "smoke_test.py"):
                sftp.put(str(WORKER / name), f"/opt/vocal-worker/{name}")
            sftp.put(str(MIGRATION), f"/opt/uvs-migrate/{MIGRATION.name}")
            sftp.put(
                str(WORKER / "vocal-worker.service"),
                "/etc/systemd/system/vocal-worker.service",
            )
            with sftp.file("/etc/uniquevocal/vocal-worker.env", "wb") as handle:
                handle.write(worker_env)
        finally:
            sftp.close()
        run(
            client,
            f"docker exec -i supabase-db psql -U postgres -d postgres "
            f"-v ON_ERROR_STOP=1 < /opt/uvs-migrate/{MIGRATION.name}",
        )
        run(client, "apt-get update -qq && apt-get install -y -qq python3-venv ffmpeg libsndfile1")
        run(client, INSTALL_VENV, timeout=1200)
        run(client, "chown -R www-data:www-data /opt/vocal-worker /var/cache/vocal-worker")
        run(
            client,
            "chown root:www-data /etc/uniquevocal/vocal-worker.env "
            "&& chmod 640 /etc/uniquevocal/vocal-worker.env",
        )
        run(client, SANDBOX_SMOKE, timeout=180)
        run(
            client,
            "systemctl daemon-reload && systemctl enable --now vocal-worker "
            "&& systemctl restart vocal-worker "
            "&& for i in $(seq 1 20); do "
            "journalctl -u vocal-worker -n 80 --no-pager | grep -q 'worker started' && break; "
            "sleep 3; done "
            "&& systemctl is-active vocal-worker "
            "&& journalctl -u vocal-worker -n 30 --no-pager",
            timeout=180,
        )
    finally:
        client.close()


if __name__ == "__main__":
    main()
