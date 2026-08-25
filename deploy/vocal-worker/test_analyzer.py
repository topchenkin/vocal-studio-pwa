from __future__ import annotations

import tempfile
import unittest
import wave
from pathlib import Path

import numpy as np

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


MELODY = [60, 60, 62, 62, 64, 64, 67, 67] * 3


class VocalScoringTests(unittest.TestCase):
    def setUp(self) -> None:
        self.reference = features(MELODY)

    def test_constant_five_semitone_transposition_scores_high(self) -> None:
        shifted = features([value + 5 for value in MELODY])
        result = score_features(self.reference, shifted)
        self.assertTrue(result["evaluable"], result)
        self.assertEqual(result["global_shift_semitones"], 5)
        self.assertGreaterEqual(result["overall"], 80)
        self.assertGreaterEqual(result["intonation"], 90)

    def test_octave_with_recording_pad_scores_high(self) -> None:
        shifted = features([value + 12 for value in MELODY], duration=7.5)
        result = score_features(self.reference, shifted)
        self.assertTrue(result["evaluable"], result)
        self.assertEqual(result["global_shift_semitones"], 12)
        self.assertGreaterEqual(result["overall"], 80)

    def test_fractional_octave_shift_scores_high(self) -> None:
        shifted = features([value - 12.7 for value in MELODY])
        result = score_features(self.reference, shifted)
        self.assertTrue(result["evaluable"], result)
        self.assertIn(result["global_shift_semitones"], {-12, -13})
        self.assertGreaterEqual(result["overall"], 80)
        self.assertGreaterEqual(result["intonation"], 90)

    def test_octave_transposition_scores_high(self) -> None:
        shifted = features([value + 12 for value in MELODY])
        result = score_features(self.reference, shifted)
        self.assertTrue(result["evaluable"], result)
        self.assertEqual(result["global_shift_semitones"], 12)
        self.assertGreaterEqual(result["overall"], 80)
        self.assertGreaterEqual(result["intonation"], 90)

    def test_same_pitch_contour_scores_high(self) -> None:
        copied = features(list(MELODY), duration=7.4, onsets=[0.35, 1.85, 3.45, 4.85])
        result = score_features(self.reference, copied)
        self.assertTrue(result["evaluable"], result)
        self.assertGreaterEqual(result["overall"], 80)

    def test_octave_tracker_jumps_still_score_high(self) -> None:
        jumped = []
        for index, value in enumerate(MELODY):
            jumped.append(value - 12 if index % 5 else value)
        result = score_features(self.reference, features(jumped, duration=7.2))
        self.assertTrue(result["evaluable"], result)
        self.assertGreaterEqual(result["overall"], 80)
        self.assertGreaterEqual(result["intonation"], 85)

    def test_arbitrary_per_note_shifts_are_penalized(self) -> None:
        wrong = features(
            [
                value + (7 if index % 4 == 0 else -4 if index % 4 == 1 else 3 if index % 4 == 2 else -8)
                for index, value in enumerate(MELODY)
            ]
        )
        result = score_features(self.reference, wrong)
        if result["evaluable"]:
            self.assertLess(result["intonation"], 60)
            self.assertLess(result["overall"], 70)
        else:
            self.assertFalse(result["evaluable"])

    def test_rhythm_delay_and_duration_are_penalized(self) -> None:
        late = features(MELODY, duration=9.5, onsets=[1.8, 3.6, 5.5, 7.4])
        result = score_features(self.reference, late)
        self.assertTrue(result["evaluable"], result)
        self.assertLess(result["rhythm"], 80)

    def test_incomplete_voiced_coverage_lowers_completeness(self) -> None:
        incomplete = features(MELODY[:16] + [None] * 8, coverage=0.55)
        result = score_features(self.reference, incomplete)
        self.assertTrue(result["evaluable"], result)
        self.assertLess(result["completeness"], 85)

    def test_silence_and_noise_are_rejected(self) -> None:
        silence = features([None] * 24, coverage=0.0, rms_db=-80)
        noise = features([None] * 24, coverage=0.08, rms_db=-18, flatness=0.8)
        self.assertFalse(score_features(self.reference, silence)["evaluable"])
        self.assertFalse(score_features(self.reference, noise)["evaluable"])

    def test_reasonable_human_take_returns_numeric_score(self) -> None:
        human = features(
            [
                (value + 0.08) if index % 3 == 0 else (value - 0.06)
                for index, value in enumerate(MELODY)
            ],
            duration=7.4,
            onsets=[0.45, 2.0, 3.6, 5.1],
        )
        result = score_features(self.reference, human)
        self.assertTrue(result["evaluable"], result)
        self.assertIsInstance(result["overall"], int)
        self.assertGreaterEqual(result["overall"], 80)

    def test_wait_then_sing_full_phrase_is_scored(self) -> None:
        take = features([None] * 12 + MELODY + [None] * 6, duration=10.0, coverage=0.55)
        result = score_features(self.reference, take)
        self.assertTrue(result["evaluable"], result)
        self.assertGreaterEqual(result["overall"], 70)

    def test_drone_is_not_scored(self) -> None:
        result = score_features(self.reference, features([60] * 24, coverage=0.9))
        self.assertFalse(result["evaluable"])

    def test_hum_narrow_chroma_is_not_scored(self) -> None:
        hum = features([60.1, 60.0, 59.8, 60.2] * 6, coverage=0.88)
        result = score_features(self.reference, hum)
        self.assertFalse(result["evaluable"])

    def test_abort_mid_phrase_is_not_scored(self) -> None:
        abort = features(MELODY[:4] + [None] * 20, coverage=0.14)
        result = score_features(self.reference, abort)
        self.assertFalse(result["evaluable"])

    def test_chance_contour_is_not_scored(self) -> None:
        reversed_take = features(list(reversed(MELODY)), coverage=0.85)
        self.assertFalse(score_features(self.reference, reversed_take)["evaluable"])
        rng = np.random.default_rng(7)
        random_take = features(
            [float(48 + rng.integers(0, 24)) for _ in MELODY],
            coverage=0.85,
        )
        self.assertFalse(score_features(self.reference, random_take)["evaluable"])

    def test_piano_rests_are_not_melody_targets(self) -> None:
        rest = [None] * 8
        reference = features(rest + MELODY + rest, duration=10.0, coverage=0.55)
        silent = features(rest + MELODY + rest, duration=10.0, coverage=0.55)
        sung_piano = features([64] * 8 + MELODY + [60] * 8, duration=10.0, coverage=0.95)
        quiet = score_features(reference, silent)
        noisy = score_features(reference, sung_piano)
        self.assertTrue(quiet["evaluable"], quiet)
        self.assertGreaterEqual(quiet["overall"], 80)
        self.assertGreaterEqual(quiet["confidence"]["rest_silence"], 0.9)
        self.assertTrue(noisy["evaluable"], noisy)
        self.assertLess(noisy["completeness"], quiet["completeness"])
        self.assertLess(noisy["confidence"]["rest_silence"], quiet["confidence"]["rest_silence"])
        self.assertLessEqual(noisy["overall"], quiet["overall"])

    def test_loudness_does_not_change_score(self) -> None:
        loud = score_features(self.reference, features(MELODY, rms_db=-8))
        quiet = score_features(self.reference, features(MELODY, rms_db=-32))
        self.assertTrue(loud["evaluable"] and quiet["evaluable"])
        self.assertEqual(loud["overall"], quiet["overall"])
        self.assertEqual(loud["intonation"], quiet["intonation"])
        self.assertEqual(loud["rhythm"], quiet["rhythm"])

    def test_expressive_slides_inside_notes_still_score_high(self) -> None:
        slides = []
        for index, value in enumerate(MELODY):
            slides.append(value + (0.35 if index % 2 else -0.25))
        result = score_features(self.reference, features(slides))
        self.assertTrue(result["evaluable"], result)
        self.assertGreaterEqual(result["intonation"], 90)
        self.assertGreaterEqual(result["overall"], 80)

    def test_extracted_reasonable_take_is_scored(self) -> None:
        try:
            import soundfile  # noqa: F401
            from analyzer import extract_features
        except ImportError:
            self.skipTest("librosa/soundfile are not installed in this environment")

        sample_rate = 16_000
        freqs_ref = [220.0, 246.9, 261.6, 293.7, 329.6]
        freqs_stu = [246.9, 277.2, 293.7, 329.6, 349.2]
        note_sec, gap_sec = 0.45, 0.16

        def melody(freqs: list[float]) -> np.ndarray:
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
            ref_path = Path(temp) / "ref.wav"
            stu_path = Path(temp) / "stu.wav"
            write_wav(ref_path, melody(freqs_ref))
            write_wav(stu_path, melody(freqs_stu))
            result = score_features(
                extract_features(str(ref_path), yin_fill=False),
                extract_features(str(stu_path)),
            )
        self.assertTrue(result["evaluable"], result)
        self.assertIsInstance(result["overall"], int)
        self.assertGreaterEqual(result["overall"], 40)


if __name__ == "__main__":
    unittest.main()
