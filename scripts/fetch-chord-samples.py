"""Download chord-loop note samples into public/samples."""
from __future__ import annotations

import shutil
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "public" / "samples"
FLUID = "https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts@gh-pages/FluidR3_GM"
IOWA = (
    "https://cdn.jsdelivr.net/gh/nbrosowsky/tonejs-instruments@master"
    "/samples/guitar-acoustic"
)
FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
SHARP = ["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"]


def midi_name(names: list[str], midi: int) -> str:
    return f"{names[midi % 12]}{midi // 12 - 1}"


def main() -> None:
    only = sys.argv[1] if len(sys.argv) > 1 else ""
    jobs: list[tuple[str, str, Path]] = []

    if only in ("", "fluid"):
        for folder, bank, start, stop in (
            ("piano", "acoustic_grand_piano-mp3", 36, 76),
            ("rock-guitar", "overdriven_guitar-mp3", 36, 76),
        ):
            dest = ROOT / folder
            dest.mkdir(parents=True, exist_ok=True)
            for midi in range(start, stop + 1, 2):
                name = midi_name(FLAT, midi)
                url = f"{FLUID}/{bank}/{name}.mp3"
                jobs.append((folder, url, dest / f"{name}.mp3"))

    if only in ("", "guitar"):
        guitar = ROOT / "guitar"
        if guitar.exists():
            shutil.rmtree(guitar)
        guitar.mkdir(parents=True)
        for midi in range(40, 73, 2):
            src = midi_name(SHARP, midi)
            dest_name = midi_name(FLAT, midi)
            jobs.append(("guitar", f"{IOWA}/{src}.mp3", guitar / f"{dest_name}.mp3"))

    def fetch(job: tuple[str, str, Path]) -> tuple[str, Path, int]:
        folder, url, path = job
        urllib.request.urlretrieve(url, path)
        return folder, path, path.stat().st_size

    ok = 0
    with ThreadPoolExecutor(max_workers=8) as pool:
        for fut in as_completed([pool.submit(fetch, job) for job in jobs]):
            folder, path, size = fut.result()
            if size < 1000:
                raise SystemExit(f"too small {folder}/{path.name}")
            ok += 1
            print(f"{folder}/{path.name} {size}")
    print(f"downloaded {ok} files")


if __name__ == "__main__":
    main()
