"""Deploy the songwriter-chat Edge Function. Requires UVS_SSH_PASS."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
FN = ROOT / "supabase" / "functions" / "songwriter-chat" / "index.ts"
SQL = ROOT / "supabase-migrations" / "2026-08-26-ai-songwriter-tool.sql"
REMOTE_DIR = "/opt/supabase/volumes/functions/songwriter-chat"
COMPOSE = "/opt/supabase/docker-compose.yml"
ENV_PATH = "/opt/supabase/.env"
VERIFY_LINE = 'VERIFY_JWT: "${FUNCTIONS_VERIFY_JWT}"'
MARKERS = (
    "GROQ_API_KEY: ${GROQ_API_KEY}",
    "OPENAI_API_KEY: ${OPENAI_API_KEY}",
)


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
    next_text = text
    if VERIFY_LINE not in next_text:
        raise SystemExit("docker-compose.yml is missing VERIFY_JWT for functions")
    insert = VERIFY_LINE
    for marker in MARKERS:
        if marker not in next_text:
            insert += "\n      " + marker
    if insert == VERIFY_LINE:
        return next_text
    return next_text.replace(VERIFY_LINE, insert, 1)


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
    groq_key = env.get("GROQ_API_KEY", "").strip()
    openai_key = env.get("OPENAI_API_KEY", "").strip()
    if not password:
        raise SystemExit("UVS_SSH_PASS is not set")
    if not FN.is_file():
        raise SystemExit(f"missing {FN}")
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
        run(client, f"mkdir -p {REMOTE_DIR} /opt/uvs-migrate")
        sftp = client.open_sftp()
        try:
            sftp.put(str(FN), f"{REMOTE_DIR}/index.ts")
            sftp.put(str(SQL), f"/opt/uvs-migrate/{SQL.name}")
            with sftp.file(ENV_PATH, "r") as handle:
                env_text = handle.read().decode("utf-8", "replace")
            with sftp.file(COMPOSE, "r") as handle:
                compose_text = handle.read().decode("utf-8", "replace")
            next_env = env_text
            if groq_key:
                next_env = upsert_env(next_env, "GROQ_API_KEY", groq_key)
            if openai_key:
                next_env = upsert_env(next_env, "OPENAI_API_KEY", openai_key)
            next_compose = patch_compose(compose_text)
            if next_env != env_text:
                with sftp.file(ENV_PATH, "w") as handle:
                    handle.write(next_env.encode("utf-8"))
            if next_compose != compose_text:
                with sftp.file(COMPOSE, "w") as handle:
                    handle.write(next_compose.encode("utf-8"))
        finally:
            sftp.close()
        run(
            client,
            "docker exec -i supabase-db psql -U postgres -d postgres "
            f"-v ON_ERROR_STOP=1 < /opt/uvs-migrate/{SQL.name}",
        )
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
            "test -f /opt/supabase/volumes/functions/songwriter-chat/index.ts",
            timeout=80,
        )
        print("songwriter-chat deployed", flush=True)
    finally:
        client.close()


if __name__ == "__main__":
    main()
