"""Feature extraction and timbre-independent vocal phrase scoring.

MIT-compatible runtime stack: librosa (ISC), NumPy (BSD), SciPy (BSD).
The score compares F0/rhythm features only; raw waveforms and timbre are never
used as the scoring target.
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np

ANALYZER_VERSION = "vocal-score-1"
SAMPLE_RATE = 16_000


def _round_list(values: np.ndarray, digits: int) -> list[float]:
    return [round(float(value), digits) for value in values]


def extract_features(path: str, offset: float = 0, duration: float | None = None) -> dict[str, Any]:
    import librosa

    audio, sample_rate = librosa.load(
        path,
        sr=SAMPLE_RATE,
        mono=True,
        offset=max(0.0, offset),
        duration=duration,
        res_type="kaiser_fast",
    )
    if audio.size == 0:
        raise ValueError("empty_audio")

    original_peak = float(np.max(np.abs(audio)))
    clipping_ratio = float(np.mean(np.abs(audio) >= 0.995))
    rms = float(np.sqrt(np.mean(np.square(audio)) + 1e-12))
    rms_db = 20 * math.log10(max(rms, 1e-8))

    # Loudness normalization is analysis-only and does not change the stored take.
    target_rms = 10 ** (-20 / 20)
    gain = min(12.0, target_rms / max(rms, 1e-6))
    normalized = np.clip(audio * gain, -1.0, 1.0)
    hop = 256
    f0, voiced_flag, voiced_probability = librosa.pyin(
        normalized,
        fmin=librosa.note_to_hz("C2"),
        fmax=librosa.note_to_hz("C6"),
        sr=sample_rate,
        frame_length=2048,
        hop_length=hop,
        fill_na=np.nan,
    )
    times = librosa.times_like(f0, sr=sample_rate, hop_length=hop)
    probability = np.nan_to_num(voiced_probability, nan=0.0)
    voiced = np.asarray(voiced_flag, dtype=bool) & np.isfinite(f0) & (probability >= 0.55)
    midi = np.full_like(f0, np.nan, dtype=float)
    midi[voiced] = librosa.hz_to_midi(f0[voiced])

    # Compact to roughly 20 fps while preserving voiced confidence.
    stride = max(1, round((sample_rate / hop) / 20))
    sampled = np.arange(0, len(times), stride)
    onset_frames = librosa.onset.onset_detect(
        y=normalized,
        sr=sample_rate,
        hop_length=hop,
        units="frames",
        backtrack=True,
    )
    onsets = librosa.frames_to_time(onset_frames, sr=sample_rate, hop_length=hop)
    flatness = float(np.mean(librosa.feature.spectral_flatness(y=normalized)))
    voiced_coverage = float(np.mean(voiced)) if voiced.size else 0.0

    return {
        "version": ANALYZER_VERSION,
        "sample_rate": SAMPLE_RATE,
        "duration": round(float(audio.size / sample_rate), 4),
        "times": _round_list(times[sampled], 4),
        "pitch_midi": [
            None if not np.isfinite(midi[index]) else round(float(midi[index]), 3)
            for index in sampled
        ],
        "confidence": _round_list(probability[sampled], 3),
        "onsets": _round_list(onsets, 4),
        "voiced_coverage": round(voiced_coverage, 4),
        "rms_db": round(rms_db, 2),
        "peak": round(original_peak, 4),
        "clipping_ratio": round(clipping_ratio, 5),
        "spectral_flatness": round(flatness, 4),
    }


def _voiced_track(features: dict[str, Any]) -> tuple[np.ndarray, np.ndarray]:
    times: list[float] = []
    pitch: list[float] = []
    for time, value, confidence in zip(
        features.get("times", []),
        features.get("pitch_midi", []),
        features.get("confidence", []),
    ):
        if value is not None and float(confidence) >= 0.5:
            times.append(float(time))
            pitch.append(float(value))
    return np.asarray(times), np.asarray(pitch)


def _dtw_pairs(reference: np.ndarray, student: np.ndarray) -> list[tuple[int, int]]:
    """DTW on median-relative melody, so one global transposition is alignable."""
    if reference.size == 0 or student.size == 0:
        return []
    ref_relative = reference - np.median(reference)
    stu_relative = student - np.median(student)
    n, m = len(reference), len(student)
    costs = np.full((n + 1, m + 1), np.inf)
    costs[0, 0] = 0
    parent = np.zeros((n + 1, m + 1), dtype=np.uint8)
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            local = min(12.0, abs(ref_relative[i - 1] - stu_relative[j - 1]))
            choices = (costs[i - 1, j - 1], costs[i - 1, j] + 0.18, costs[i, j - 1] + 0.18)
            move = int(np.argmin(choices))
            costs[i, j] = local + choices[move]
            parent[i, j] = move
    pairs: list[tuple[int, int]] = []
    i, j = n, m
    while i > 0 and j > 0:
        pairs.append((i - 1, j - 1))
        move = int(parent[i, j])
        if move == 0:
            i -= 1
            j -= 1
        elif move == 1:
            i -= 1
        else:
            j -= 1
    pairs.reverse()
    return pairs


def _rhythm_score(reference: dict[str, Any], student: dict[str, Any]) -> float:
    ref_duration = max(0.1, float(reference.get("duration", 0)))
    stu_duration = max(0.1, float(student.get("duration", 0)))
    ref_onsets = np.asarray(reference.get("onsets", []), dtype=float)
    stu_onsets = np.asarray(student.get("onsets", []), dtype=float)
    duration_penalty = min(1.0, abs(stu_duration - ref_duration) / ref_duration)
    if ref_onsets.size == 0:
        onset_score = max(0.0, 1.0 - duration_penalty)
    elif stu_onsets.size == 0:
        onset_score = 0.0
    else:
        errors = [float(np.min(np.abs(stu_onsets - onset))) / ref_duration for onset in ref_onsets]
        missing = max(0, len(ref_onsets) - len(stu_onsets)) / len(ref_onsets)
        onset_score = math.exp(-8.0 * float(np.mean(errors))) * (1.0 - 0.55 * missing)
    return 100.0 * max(0.0, onset_score * (1.0 - 0.55 * duration_penalty))


def score_features(reference: dict[str, Any], student: dict[str, Any]) -> dict[str, Any]:
    """Return transparent weighted scores or a confidence-gated rejection."""
    coverage = float(student.get("voiced_coverage", 0))
    rms_db = float(student.get("rms_db", -120))
    clipping = float(student.get("clipping_ratio", 0))
    flatness = float(student.get("spectral_flatness", 0))
    gate_reason: str | None = None
    if rms_db < -48:
        gate_reason = "Сигнал слишком тихий. Поднесите микрофон ближе и спойте ещё раз."
    elif coverage < 0.12:
        gate_reason = "Не удалось распознать достаточно пения. Попробуйте в более тихом месте."
    elif clipping > 0.015:
        gate_reason = "Запись перегружена. Отодвиньтесь немного от микрофона."
    elif flatness > 0.55 and coverage < 0.3:
        gate_reason = "В записи слишком много шума для честной оценки."
    if gate_reason:
        return {
            "evaluable": False,
            "reason": gate_reason,
            "confidence": {
                "voiced_coverage": coverage,
                "rms_db": rms_db,
                "clipping_ratio": clipping,
                "spectral_flatness": flatness,
            },
        }

    _, ref_pitch = _voiced_track(reference)
    _, stu_pitch = _voiced_track(student)
    pairs = _dtw_pairs(ref_pitch, stu_pitch)
    if len(pairs) < 5:
        return {
            "evaluable": False,
            "reason": "Не удалось уверенно сопоставить мелодию. Повторите короткую фразу.",
            "confidence": {"aligned_frames": len(pairs), "voiced_coverage": coverage},
        }

    differences = np.asarray([stu_pitch[j] - ref_pitch[i] for i, j in pairs])
    global_shift = int(np.rint(np.median(differences)))
    cents_error = np.abs((differences - global_shift) * 100)
    frame_quality = np.clip(1.0 - cents_error / 100.0, 0.0, 1.0)
    intonation = 100.0 * float(np.mean(frame_quality))
    rhythm = _rhythm_score(reference, student)
    duration_delta = abs(
        float(student.get("duration", 0)) - float(reference.get("duration", 0))
    )
    # A near-digital copy at the original key and timing is almost certainly
    # loudspeaker/headphone bleed, not a human take. Keep this gate deliberately
    # strict so an excellent singer is not rejected.
    if (
        global_shift == 0
        and float(np.median(cents_error)) < 3
        and float(np.percentile(cents_error, 90)) < 8
        and rhythm > 97
        and duration_delta < 0.08
    ):
        return {
            "evaluable": False,
            "reason": "Фонограмма слишком сильно попала в микрофон. Используйте наушники и повторите.",
            "confidence": {
                "playback_leak": "severe",
                "median_residual_cents": round(float(np.median(cents_error)), 1),
            },
        }
    ref_coverage = max(0.05, float(reference.get("voiced_coverage", 0.05)))
    voiced_ratio = min(1.0, coverage / ref_coverage)
    aligned_ratio = min(1.0, len({i for i, _ in pairs}) / max(1, len(ref_pitch)))
    completeness = 100.0 * (0.65 * voiced_ratio + 0.35 * aligned_ratio)

    intonation_i = int(round(np.clip(intonation, 0, 100)))
    rhythm_i = int(round(np.clip(rhythm, 0, 100)))
    completeness_i = int(round(np.clip(completeness, 0, 100)))
    overall = int(round(0.5 * intonation_i + 0.3 * rhythm_i + 0.2 * completeness_i))
    weakest = min(
        ("intonation", intonation_i),
        ("rhythm", rhythm_i),
        ("completeness", completeness_i),
        key=lambda item: item[1],
    )[0]
    feedback = {
        "intonation": "Сфокусируйтесь на точных интервалах между нотами.",
        "rhythm": "Попробуйте точнее повторить вступления и длительности.",
        "completeness": "Пропойте фразу целиком, сохраняя опору до конца.",
    }[weakest]
    return {
        "evaluable": True,
        "overall": overall,
        "intonation": intonation_i,
        "rhythm": rhythm_i,
        "completeness": completeness_i,
        "global_shift_semitones": global_shift,
        "feedback": feedback,
        "confidence": {
            "aligned_frames": len(pairs),
            "voiced_coverage": coverage,
            "median_residual_cents": round(float(np.median(cents_error)), 1),
        },
    }
