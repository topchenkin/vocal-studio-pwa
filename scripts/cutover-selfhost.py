"""Sync keys, rebuild static site, deploy Caddy + AI + push to the VPS."""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

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


def run(cmd: list[str] | str, extra: dict[str, str] | None = None) -> None:
    env = os.environ.copy()
    env.update(load_env())
    if extra:
        env.update(extra)
    printable = cmd if isinstance(cmd, str) else " ".join(cmd)
    print(">", printable, flush=True)
    subprocess.check_call(
        cmd,
        cwd=ROOT,
        env=env,
        shell=isinstance(cmd, str),
    )


def main() -> None:
    run([sys.executable, "scripts/sync-selfhost-env.py"])
    run("npm run build")
    local = load_env()
    extra = {
        "UVS_SSH_PASS": local["UVS_SSH_PASS"],
        "UVS_SSH_HOST": local.get("UVS_SSH_HOST", "5.42.123.142"),
    }
    run([sys.executable, "scripts/deploy-site-vps.py"], extra)
    run([sys.executable, "scripts/deploy-ai-vps.py"], extra)
    run([sys.executable, "scripts/deploy-push-vps.py"], extra)


if __name__ == "__main__":
    main()
