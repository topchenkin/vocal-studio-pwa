"""Import librosa and run the real feature-extraction + scoring path."""
from __future__ import annotations

import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

from analyzer import ANALYZER_VERSION, extract_features, score_features


def _melody(path: Path, freqs: list[float], sample_rate: int = 16_000) -> None:
    note_sec, gap_sec = 0.55, 0.18
    pieces: list[np.ndarray] = []
    for freq in freqs:
        times = np.linspace(0, note_sec, int(sample_rate * note_sec), endpoint=False)
        pieces.append(0.22 * np.sin(2 * np.pi * freq * times))
        pieces.append(np.zeros(int(sample_rate * gap_sec), dtype=float))
    sf.write(path, np.concatenate(pieces).astype(np.float32), sample_rate)


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="uvs-smoke-") as temp:
        ref_path = Path(temp) / "ref.wav"
        stu_path = Path(temp) / "stu.wav"
        _melody(ref_path, [220.0, 246.9, 261.6, 293.7, 329.6])
        _melody(stu_path, [246.9, 277.2, 293.7, 329.6, 349.2])
        reference = extract_features(str(ref_path))
        student = extract_features(str(stu_path))
        result = score_features(reference, student)
    if float(reference.get("duration", 0)) < 1:
        raise SystemExit("smoke test: extracted duration is too short")
    if not result.get("evaluable"):
        raise SystemExit(f"smoke test: reasonable take was not scored: {result}")
    if not isinstance(result.get("overall"), int):
        raise SystemExit("smoke test: overall score is missing")
    print(
        "smoke-ok",
        ANALYZER_VERSION,
        "duration",
        reference["duration"],
        "coverage",
        reference["voiced_coverage"],
        "score",
        result["overall"],
        flush=True,
    )


if __name__ == "__main__":
    main()
