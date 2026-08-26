"""Deploy the generate-music Edge Function. Requires UVS_SSH_PASS."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
FN = ROOT / "supabase" / "functions" / "generate-music" / "index.ts"
REMOTE_DIR = "/opt/supabase/volumes/functions/generate-music"
COMPOSE = "/opt/supabase/docker-compose.yml"
ENV_PATH = "/opt/supabase/.env"
COMPOSE_MARKER = 'HUGGINGFACE_API_KEY: ${HUGGINGFACE_API_KEY}'
VERIFY_LINE = 'VERIFY_JWT: "${FUNCTIONS_VERIFY_JWT}"'


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


def upsert_env(text: str, key: str, value: str) -> str:
    lines = text.splitlines()
    found = False
    out: list[str] = []
    for line in lines:
        if line.startswith(f"{key}="):
            out.append(f"{key}={value}")
            found = True
        else:
            out.append(line)
    if not found:
        if out and out[-1] != "":
            out.append("")
        out.append(f"{key}={value}")
    return "\n".join(out).rstrip() + "\n"


def patch_compose(text: str) -> str:
    if COMPOSE_MARKER in text:
        return text
    if VERIFY_LINE not in text:
        raise SystemExit("docker-compose.yml is missing VERIFY_JWT for functions")
    return text.replace(
        VERIFY_LINE,
        VERIFY_LINE + "\n      " + COMPOSE_MARKER,
        1,
    )


def run(client: paramiko.SSHClient, command: str, timeout: int = 180) -> None:
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
    hf_key = env.get("HUGGINGFACE_API_KEY", "").strip()
    if not password:
        raise SystemExit("UVS_SSH_PASS is not set")
    if not hf_key:
        raise SystemExit("HUGGINGFACE_API_KEY is missing in .env.local")
    if not FN.is_file():
        raise SystemExit(f"missing {FN}")

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
        run(client, f"mkdir -p {REMOTE_DIR}")
        sftp = client.open_sftp()
        try:
            sftp.put(str(FN), f"{REMOTE_DIR}/index.ts")
            with sftp.file(ENV_PATH, "r") as handle:
                env_text = handle.read().decode("utf-8", "replace")
            with sftp.file(COMPOSE, "r") as handle:
                compose_text = handle.read().decode("utf-8", "replace")
            next_env = upsert_env(env_text, "HUGGINGFACE_API_KEY", hf_key)
            next_compose = patch_compose(compose_text)
            with sftp.file(ENV_PATH, "w") as handle:
                handle.write(next_env.encode("utf-8"))
            if next_compose != compose_text:
                with sftp.file(COMPOSE, "w") as handle:
                    handle.write(next_compose.encode("utf-8"))
        finally:
            sftp.close()
        run(
            client,
            "cd /opt/supabase && docker compose up -d --no-deps --force-recreate functions",
            timeout=180,
        )
        run(
            client,
            "for i in $(seq 1 20); do "
            "docker inspect -f '{{.State.Health.Status}}' supabase-edge-functions | grep -q healthy && break; "
            "sleep 2; done; "
            "docker inspect -f '{{.State.Health.Status}}' supabase-edge-functions; "
            "test -f /opt/supabase/volumes/functions/generate-music/index.ts",
            timeout=80,
        )
        print("generate-music deployed", flush=True)
    finally:
        client.close()


if __name__ == "__main__":
    main()
