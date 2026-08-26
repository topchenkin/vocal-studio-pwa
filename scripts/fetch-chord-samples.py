"""Download FluidR3 GM note samples into public/samples. CC BY 3.0 (Frank Wen)."""
from __future__ import annotations

import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "public" / "samples"
BASE = "https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts@gh-pages/FluidR3_GM"
NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
BANKS = {
    "piano": "acoustic_grand_piano-mp3",
    "guitar": "acoustic_guitar_steel-mp3",
    "rock-guitar": "overdriven_guitar-mp3",
}


def midi_name(midi: int) -> str:
    return f"{NAMES[midi % 12]}{midi // 12 - 1}"


def main() -> None:
    jobs: list[tuple[str, str, str, Path]] = []
    for folder, bank in BANKS.items():
        dest = ROOT / folder
        dest.mkdir(parents=True, exist_ok=True)
        for midi in range(36, 77, 2):
            name = midi_name(midi)
            jobs.append((folder, bank, name, dest / f"{name}.mp3"))

    def fetch(job: tuple[str, str, str, Path]) -> tuple[str, str, int]:
        folder, bank, name, path = job
        url = f"{BASE}/{bank}/{name}.mp3"
        urllib.request.urlretrieve(url, path)
        return folder, name, path.stat().st_size

    ok = 0
    with ThreadPoolExecutor(max_workers=8) as pool:
        for fut in as_completed([pool.submit(fetch, job) for job in jobs]):
            folder, name, size = fut.result()
            if size < 1000:
                raise SystemExit(f"too small {folder}/{name}")
            ok += 1
    print(f"downloaded {ok} files")


if __name__ == "__main__":
    main()
