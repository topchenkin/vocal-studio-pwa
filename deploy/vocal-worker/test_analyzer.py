from __future__ import annotations

import tempfile
import unittest
import wave
from pathlib import Path

import numpy as np

from analyzer import (
    GREEN_CENTS,
    quantize_note_blocks,
    score_features,
    score_with_anchors,
    shift_blocks,
)


def features(
    pitches: list[float | None],
    *,
    duration: float = 6.0,
    onsets: list[float] | None = None,
    coverage: float = 0.8,
    rms_db: float = -20,
    clipping: float = 0,
    flatness: float = 0.08,
) -> dict:
    step = duration / max(1, len(pitches))
    payload = {
        "duration": duration,
        "times": [round(index * step, 3) for index in range(len(pitches))],
        "pitch_midi": pitches,
        "confidence": [0.95 if pitch is not None else 0 for pitch in pitches],
        "onsets": onsets if onsets is not None else [0.3, 1.8, 3.4, 4.8],
        "voiced_coverage": coverage,
        "rms_db": rms_db,
        "clipping_ratio": clipping,
        "spectral_flatness": flatness,
    }
    payload["blocks"] = quantize_note_blocks(payload)
    return payload


MELODY = [60, 60, 62, 62, 64, 64, 67, 67] * 3


class HitboxScoringTests(unittest.TestCase):
    def setUp(self) -> None:
        self.reference = features(MELODY)

    def test_quantize_builds_note_blocks(self) -> None:
        blocks = self.reference["blocks"]
        self.assertGreaterEqual(len(blocks), 4)
        for block in blocks:
            self.assertIn("note", block)
            self.assertIn("startHz", block)
            self.assertIn("startTime", block)
            self.assertIn("endTime", block)
            self.assertGreater(block["endTime"], block["startTime"])

    def test_identical_take_scores_perfect(self) -> None:
        result = score_features(self.reference, features(list(MELODY)))
        self.assertTrue(result["evaluable"], result)
        self.assertEqual(result["overall"], 100)

    def test_vibrato_inside_green_zone_is_perfect(self) -> None:
        wobble = [
            value + (GREEN_CENTS / 100.0) * (0.5 if index % 2 else -0.5)
            for index, value in enumerate(MELODY)
        ]
        result = score_features(self.reference, features(wobble))
        self.assertTrue(result["evaluable"], result)
        self.assertEqual(result["overall"], 100)

    def test_near_zone_gets_half_points(self) -> None:
        near = [value + 0.9 for value in MELODY]
        result = score_features(self.reference, features(near))
        self.assertTrue(result["evaluable"], result)
        self.assertGreaterEqual(result["overall"], 40)
        self.assertLessEqual(result["overall"], 60)

    def test_wrong_notes_score_low(self) -> None:
        wrong = [value + 4 for value in MELODY]
        result = score_features(self.reference, features(wrong))
        self.assertTrue(result["evaluable"], result)
        self.assertLess(result["overall"], 20)

    def test_silence_between_blocks_is_not_penalized(self) -> None:
        rest = [None] * 8
        reference = features(rest + MELODY + rest, duration=10.0, coverage=0.55)
        student = features(rest + MELODY + rest, duration=10.0, coverage=0.55)
        result = score_features(reference, student)
        self.assertTrue(result["evaluable"], result)
        self.assertGreaterEqual(result["overall"], 90)

    def test_manual_transpose_shifts_hitboxes(self) -> None:
        shifted = features([value + 2 for value in MELODY])
        miss = score_features(self.reference, shifted, transpose=0)
        hit = score_features(self.reference, shifted, transpose=2)
        self.assertTrue(hit["evaluable"], hit)
        self.assertGreaterEqual(hit["overall"], 90)
        self.assertLess(miss["overall"], 40)
        self.assertEqual(hit["global_shift_semitones"], 2)

    def test_no_automatic_octave_transpose(self) -> None:
        octave = features([value + 12 for value in MELODY])
        result = score_features(self.reference, octave)
        self.assertTrue(result["evaluable"], result)
        self.assertLess(result["overall"], 25)

    def test_dropdown_clamped_to_two_semitones(self) -> None:
        blocks = shift_blocks(self.reference["blocks"], 9)
        self.assertEqual(blocks[0]["midi"], self.reference["blocks"][0]["midi"] + 2)

    def test_silence_and_noise_are_rejected(self) -> None:
        silence = features([None] * 24, coverage=0.0, rms_db=-80)
        noise = features([None] * 24, coverage=0.08, rms_db=-18, flatness=0.8)
        self.assertFalse(score_features(self.reference, silence)["evaluable"])
        self.assertFalse(score_features(self.reference, noise)["evaluable"])

    def test_abort_mid_phrase_is_not_scored(self) -> None:
        abort = features(MELODY[:2] + [None] * 22, coverage=0.1)
        result = score_features(self.reference, abort)
        self.assertFalse(result["evaluable"])

    def test_russian_strings_are_cyrillic_not_question_marks(self) -> None:
        from analyzer import UNRECOGNIZED

        source = Path(__file__).with_name("analyzer.py").read_text(encoding="utf-8")
        self.assertIn("\\u041d\\u0435", source)
        self.assertNotIn("?? ???????", source)
        self.assertIn("\u0440\u0430\u0441\u043f\u043e\u0437\u043d\u0430\u0442\u044c", UNRECOGNIZED)
        scored = score_features(self.reference, features(list(MELODY)))
        self.assertTrue(scored["evaluable"], scored)
        self.assertRegex(scored["feedback"], r"[\u0410-\u044f\u0401\u0451]")
        self.assertNotIn("????", scored["feedback"])

    def test_anchors_do_not_change_hitbox_score(self) -> None:
        high = features(list(MELODY))
        low = features([value + 5 for value in MELODY])
        direct = score_features(self.reference, features(list(MELODY)))
        blended = score_with_anchors(
            self.reference, features(list(MELODY)), {"high": high, "low": low}
        )
        self.assertEqual(direct["overall"], blended["overall"])

    def test_extracted_same_melody_is_perfect(self) -> None:
        try:
            from analyzer import extract_features
            import librosa  # noqa: F401
        except (ImportError, ModuleNotFoundError):
            self.skipTest("librosa/soundfile are not installed in this environment")

        sample_rate = 16_000
        freqs = [220.0, 246.9, 261.6, 293.7, 329.6]
        note_sec, gap_sec = 0.45, 0.16

        def melody() -> np.ndarray:
            pieces = []
            for freq in freqs:
                times = np.linspace(0, note_sec, int(sample_rate * note_sec), endpoint=False)
                pieces.append(0.22 * np.sin(2 * np.pi * freq * times))
                pieces.append(np.zeros(int(sample_rate * gap_sec)))
            return np.clip(np.concatenate(pieces), -1.0, 1.0)

        def write_wav(path: Path, audio: np.ndarray) -> None:
            pcm = (audio * 32767.0).astype(np.int16)
            with wave.open(str(path), "wb") as handle:
                handle.setnchannels(1)
                handle.setsampwidth(2)
                handle.setframerate(sample_rate)
                handle.writeframes(pcm.tobytes())

        with tempfile.TemporaryDirectory(prefix="uvs-score-") as temp:
            path = Path(temp) / "same.wav"
            write_wav(path, melody())
            extracted = extract_features(str(path), yin_fill=False)
            self.assertGreaterEqual(len(extracted.get("blocks") or []), 3)
            result = score_features(extracted, extract_features(str(path)))
        self.assertTrue(result["evaluable"], result)
        self.assertGreaterEqual(result["overall"], 80)


if __name__ == "__main__":
    unittest.main()
