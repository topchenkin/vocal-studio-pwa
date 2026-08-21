"""Upload schema + restore script and apply them on the VPS."""
from __future__ import annotations

from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]


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
        sftp = client.open_sftp()
        try:
            sftp.put(
                str(ROOT / "supabase-schema.sql"),
                "/opt/uvs-migrate/schema.sql",
            )
            remote_mig = "/opt/uvs-migrate/migrations"
            try:
                sftp.mkdir(remote_mig)
            except OSError:
                pass
            mig_dir = ROOT / "supabase-migrations"
            for path in sorted(mig_dir.glob("*.sql")):
                sftp.put(str(path), f"{remote_mig}/{path.name}")
            data = (ROOT / "deploy/self-hosted/restore-local.mjs").read_bytes().replace(
                b"\r\n", b"\n"
            )
            with sftp.file("/opt/uvs-migrate/restore-local.mjs", "wb") as fh:
                fh.write(data)
            data = (ROOT / "deploy/self-hosted/apply-restore.sh").read_bytes().replace(
                b"\r\n", b"\n"
            )
            with sftp.file("/opt/uvs-migrate/apply-restore.sh", "wb") as fh:
                fh.write(data)
        finally:
            sftp.close()
        code, out, err = run(client, "bash /opt/uvs-migrate/apply-restore.sh", 300)
        Path(__file__).with_name("_restore.out").write_text(
            f"exit={code}\n{out}\nSTDERR\n{err}", encoding="utf-8"
        )
        print("exit", code, "wrote _restore.out")
        if code != 0:
            raise SystemExit(code)
    finally:
        client.close()


if __name__ == "__main__":
    main()
