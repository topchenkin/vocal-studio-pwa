"""Upload self-hosted helpers to the VPS and start bootstrap + dump."""
from __future__ import annotations

from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(__file__).with_name("_vps_exec.out")


def load_env() -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def run(client: paramiko.SSHClient, cmd: str, timeout: int) -> tuple[int, str, str]:
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    return code, out, err


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
        run(client, "mkdir -p /opt/uvs-migrate /opt/supabase-bootstrap", 30)
        sftp = client.open_sftp()
        try:
            data = (ROOT / "deploy/self-hosted/bootstrap.sh").read_bytes().replace(b"\r\n", b"\n")
            with sftp.file("/opt/uvs-migrate/bootstrap.sh", "wb") as fh:
                fh.write(data)
            data = (ROOT / "deploy/self-hosted/dump-hosted.mjs").read_bytes().replace(b"\r\n", b"\n")
            with sftp.file("/opt/uvs-migrate/dump-hosted.mjs", "wb") as fh:
                fh.write(data)
        finally:
            sftp.close()
        run(client, "chmod +x /opt/uvs-migrate/bootstrap.sh", 15)
        code, out, err = run(
            client,
            "nohup bash /opt/uvs-migrate/bootstrap.sh >/dev/null 2>&1 & echo started:$!",
            20,
        )
        print("bootstrap", code, out.strip(), err.strip())
        dump_cmd = (
            "set -a; . /etc/uniquevocal/ai-api.env; set +a; "
            "export OUT_DIR=/opt/uvs-migrate; "
            "nohup node /opt/uvs-migrate/dump-hosted.mjs "
            "> /opt/uvs-migrate/dump.log 2>&1 & echo dump:$!"
        )
        code, out, err = run(client, dump_cmd, 20)
        print("dump", code, out.strip(), err.strip())
    finally:
        client.close()


if __name__ == "__main__":
    main()
