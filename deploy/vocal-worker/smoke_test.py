"""Import librosa and run the real feature-extraction path."""
from __future__ import annotations

import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

from analyzer import ANALYZER_VERSION, extract_features


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="uvs-smoke-") as temp:
        path = Path(temp) / "tone.wav"
        sample_rate = 16_000
        times = np.linspace(0, 1.6, int(sample_rate * 1.6), endpoint=False)
        audio = (0.22 * np.sin(2 * np.pi * 220 * times)).astype(np.float32)
        sf.write(path, audio, sample_rate)
        features = extract_features(str(path))
    if float(features.get("duration", 0)) < 1:
        raise SystemExit("smoke test: extracted duration is too short")
    if "pitch_midi" not in features:
        raise SystemExit("smoke test: pitch track is missing")
    print(
        "smoke-ok",
        ANALYZER_VERSION,
        "duration",
        features["duration"],
        "coverage",
        features["voiced_coverage"],
        flush=True,
    )


if __name__ == "__main__":
    main()
