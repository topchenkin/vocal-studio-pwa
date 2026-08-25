from __future__ import annotations

import unittest

from analyzer import score_features


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
    return {
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


class VocalScoringTests(unittest.TestCase):
    def setUp(self) -> None:
        self.reference = features([60, 60, 62, 62, 64, 64, 67, 67] * 3)

    def test_constant_five_semitone_transposition_scores_high(self) -> None:
        shifted = features([value + 5 for value in self.reference["pitch_midi"]])
        result = score_features(self.reference, shifted)
        self.assertTrue(result["evaluable"])
        self.assertEqual(result["global_shift_semitones"], 5)
        self.assertGreaterEqual(result["overall"], 95)

    def test_arbitrary_per_note_shifts_are_penalized(self) -> None:
        wrong = features(
            [
                value + (5 if index % 4 == 0 else -3 if index % 4 == 1 else 2)
                for index, value in enumerate(self.reference["pitch_midi"])
            ]
        )
        result = score_features(self.reference, wrong)
        self.assertTrue(result["evaluable"])
        self.assertLess(result["intonation"], 60)

    def test_rhythm_delay_and_duration_are_penalized(self) -> None:
        late = features(
            self.reference["pitch_midi"],
            duration=8.5,
            onsets=[1.2, 2.9, 4.7, 6.5],
        )
        result = score_features(self.reference, late)
        self.assertTrue(result["evaluable"])
        self.assertLess(result["rhythm"], 65)

    def test_incomplete_voiced_coverage_lowers_completeness(self) -> None:
        incomplete = features(
            self.reference["pitch_midi"][:12] + [None] * 12,
            coverage=0.32,
        )
        result = score_features(self.reference, incomplete)
        self.assertTrue(result["evaluable"])
        self.assertLess(result["completeness"], 70)

    def test_silence_and_noise_are_rejected(self) -> None:
        silence = features([None] * 24, coverage=0.0, rms_db=-80)
        noise = features([None] * 24, coverage=0.08, rms_db=-18, flatness=0.8)
        self.assertFalse(score_features(self.reference, silence)["evaluable"])
        self.assertFalse(score_features(self.reference, noise)["evaluable"])

    def test_near_digital_playback_leak_is_rejected(self) -> None:
        copied = features(list(self.reference["pitch_midi"]))
        result = score_features(self.reference, copied)
        self.assertFalse(result["evaluable"])
        self.assertEqual(result["confidence"]["playback_leak"], "severe")


if __name__ == "__main__":
    unittest.main()
