"""Copy self-hosted API keys from the VPS into .env.local. Keeps hosted keys as HOSTED_*."""
from __future__ import annotations

from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env.local"


def load_pairs(text: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def dump_pairs(values: dict[str, str], original: str) -> str:
    keys_written = set()
    lines: list[str] = []
    for raw in original.splitlines():
        if not raw.strip() or raw.strip().startswith("#") or "=" not in raw:
            lines.append(raw)
            continue
        key = raw.split("=", 1)[0].strip()
        if key in values:
            lines.append(f"{key}={values[key]}")
            keys_written.add(key)
        else:
            lines.append(raw)
    for key, value in values.items():
        if key not in keys_written:
            lines.append(f"{key}={value}")
    if lines and lines[-1] != "":
        lines.append("")
    return "\n".join(lines)


def main() -> None:
    local = load_pairs(ENV_PATH.read_text(encoding="utf-8"))
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        local.get("UVS_SSH_HOST", "5.42.123.142"),
        username="root",
        password=local["UVS_SSH_PASS"],
        timeout=30,
        allow_agent=False,
        look_for_keys=False,
    )
    try:
        _, stdout, _ = client.exec_command(
            "grep -E '^(ANON_KEY|SERVICE_ROLE_KEY)=' /opt/supabase/.env",
            timeout=20,
        )
        remote = load_pairs(stdout.read().decode("utf-8", "replace"))
    finally:
        client.close()
    if not remote.get("ANON_KEY") or not remote.get("SERVICE_ROLE_KEY"):
        raise SystemExit("missing keys on VPS")
    original = ENV_PATH.read_text(encoding="utf-8")
    values = load_pairs(original)
    if "HOSTED_SUPABASE_URL" not in values:
        values["HOSTED_SUPABASE_URL"] = values.get("NEXT_PUBLIC_SUPABASE_URL", "")
        values["HOSTED_SUPABASE_ANON_KEY"] = values.get(
            "NEXT_PUBLIC_SUPABASE_ANON_KEY", ""
        )
        values["HOSTED_SUPABASE_SERVICE_ROLE_KEY"] = values.get(
            "SUPABASE_SERVICE_ROLE_KEY", ""
        )
    values["NEXT_PUBLIC_SUPABASE_URL"] = "https://sb.uniquevocal.ru"
    values["NEXT_PUBLIC_SUPABASE_PROXY_URL"] = "https://sb.uniquevocal.ru"
    values["NEXT_PUBLIC_SUPABASE_ANON_KEY"] = remote["ANON_KEY"]
    values["SUPABASE_SERVICE_ROLE_KEY"] = remote["SERVICE_ROLE_KEY"]
    values["SELFHOST_SUPABASE_URL"] = "http://127.0.0.1:8000"
    ENV_PATH.write_text(dump_pairs(values, original), encoding="utf-8")
    print("updated .env.local (keys not printed)")


if __name__ == "__main__":
    main()
