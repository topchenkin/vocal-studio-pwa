from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(__file__).with_name("_restore.out")


def load_env() -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def main() -> None:
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
        sftp = client.open_sftp()
        try:
            data = (ROOT / "deploy/self-hosted/restore-local.mjs").read_bytes().replace(
                b"\r\n", b"\n"
            )
            with sftp.file("/opt/uvs-migrate/restore-local.mjs", "wb") as fh:
                fh.write(data)
        finally:
            sftp.close()
        remote = (
            "export LOCAL_URL=http://127.0.0.1:8000\n"
            "export DUMP_DIR=/opt/uvs-migrate\n"
            "export SERVICE_ROLE_KEY=$(grep '^SERVICE_ROLE_KEY=' /opt/supabase/.env | cut -d= -f2-)\n"
            "node /opt/uvs-migrate/restore-local.mjs\n"
        )
        _, stdout, stderr = client.exec_command(remote, timeout=180)
        out = stdout.read().decode("utf-8", "replace")
        err = stderr.read().decode("utf-8", "replace")
        code = stdout.channel.recv_exit_status()
        OUT.write_text(f"exit={code}\n{out}\nSTDERR\n{err}", encoding="utf-8")
        print("exit", code)
        if code != 0:
            raise SystemExit(code)
    finally:
        client.close()


if __name__ == "__main__":
    main()
