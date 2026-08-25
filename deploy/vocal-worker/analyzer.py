"""Feature extraction and timbre-independent vocal phrase scoring.

MIT-compatible runtime stack: librosa (ISC), NumPy (BSD), SciPy (BSD).
The score compares F0/rhythm features only; raw waveforms and timbre are never
used as the scoring target.
"""
from __future__ import annotations

import math
import os
import sys
import tempfile
from pathlib import Path
from typing import Any

import numpy as np

ANALYZER_VERSION = "vocal-score-2"
SAMPLE_RATE = 16_000
DEFAULT_NUMBA_CACHE = "/var/cache/vocal-worker/numba"

_librosa = None


def configure_numba_runtime() -> Path:
    """Point Numba at a writable cache. systemd ProtectSystem=strict makes
    site-packages read-only, so the default in-tree locator cannot be used.
    """
    cache_dir = Path(os.environ.get("NUMBA_CACHE_DIR", DEFAULT_NUMBA_CACHE))
    try:
        cache_dir.mkdir(parents=True, exist_ok=True)
        probe = cache_dir / ".write-test"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
    except OSError:
        cache_dir = Path(tempfile.gettempdir()) / "vocal-worker-numba"
        cache_dir.mkdir(parents=True, exist_ok=True)
    os.environ["NUMBA_CACHE_DIR"] = str(cache_dir)
    os.environ.pop("NUMBA_CACHE_LOCATOR_CLASSES", None)
    return cache_dir


def _disable_numba_function_cache() -> None:
    import numba
    from numba.core import decorators

    original = decorators.jit

    def jit(*args, cache=False, **kwargs):  # noqa: ANN002
        kwargs["cache"] = False
        return original(*args, **kwargs)

    decorators.jit = jit
    numba.jit = jit
    for name in list(sys.modules):
        if name == "librosa" or name.startswith("librosa."):
            del sys.modules[name]


def _import_librosa():
    global _librosa
    if _librosa is not None:
        return _librosa
    configure_numba_runtime()
    try:
        import librosa
        import librosa.core.notation  # noqa: F401  # eager: lazy loader hides cache errors
    except RuntimeError as error:
        message = str(error)
        if "no locator available" not in message and "cannot cache function" not in message:
            raise
        _disable_numba_function_cache()
        import librosa
    _librosa = librosa
    return librosa


configure_numba_runtime()


def _round_list(values: np.ndarray, digits: int) -> list[float]:
    return [round(float(value), digits) for value in values]


def extract_features(path: str, offset: float = 0, duration: float | None = None) -> dict[str, Any]:
    librosa = _import_librosa()

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
    gain = min(18.0, target_rms / max(rms, 1e-6))
    normalized = np.clip(audio * gain, -1.0, 1.0)
    hop = 256
    frame_length = 2048
    f0, voiced_flag, voiced_probability = librosa.pyin(
        normalized,
        fmin=librosa.note_to_hz("C2"),
        fmax=librosa.note_to_hz("C7"),
        sr=sample_rate,
        frame_length=frame_length,
        hop_length=hop,
        fill_na=np.nan,
    )
    times = librosa.times_like(f0, sr=sample_rate, hop_length=hop)
    probability = np.nan_to_num(voiced_probability, nan=0.0)
    voiced = (
        np.asarray(voiced_flag, dtype=bool)
        & np.isfinite(f0)
        & (probability >= 0.32)
    )
    frame_rms = librosa.feature.rms(
        y=normalized, frame_length=frame_length, hop_length=hop
    )[0]
    if frame_rms.size < f0.size:
        frame_rms = np.pad(frame_rms, (0, f0.size - frame_rms.size))
    elif frame_rms.size > f0.size:
        frame_rms = frame_rms[: f0.size]
    frame_db = 20 * np.log10(np.maximum(frame_rms, 1e-8))
    # Phone karaoke takes often fail pYIN voicing even when a tonal sung
    # line is present. Fill those frames with YIN only where the frame is loud.
    if voiced.size == 0 or float(np.mean(voiced)) < 0.08:
        yin_f0 = librosa.yin(
            normalized,
            fmin=librosa.note_to_hz("C2"),
            fmax=librosa.note_to_hz("C7"),
            sr=sample_rate,
            frame_length=frame_length,
            hop_length=hop,
        )
        if yin_f0.size < f0.size:
            yin_f0 = np.pad(yin_f0, (0, f0.size - yin_f0.size), constant_values=np.nan)
        elif yin_f0.size > f0.size:
            yin_f0 = yin_f0[: f0.size]
        yin_ok = np.isfinite(yin_f0) & (frame_db > -42.0)
        fill = (~voiced) & yin_ok
        if np.any(fill):
            f0 = np.where(fill, yin_f0, f0)
            probability = np.where(fill, np.maximum(probability, 0.42), probability)
            voiced = voiced | fill
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
        if value is not None and float(confidence) >= 0.3:
            times.append(float(time))
            pitch.append(float(value))
    return np.asarray(times), _unwrap_octave_jumps(np.asarray(pitch, dtype=float))


def _unwrap_octave_jumps(pitch: np.ndarray) -> np.ndarray:
    """Remove isolated ±12/±24 tracker jumps; keep real melodic motion."""
    if pitch.size < 2:
        return pitch
    out = np.empty_like(pitch)
    out[0] = pitch[0]
    cumulative = 0.0
    for index in range(1, len(pitch)):
        delta = float(pitch[index] - pitch[index - 1])
        octaves = round(delta / 12.0)
        if abs(octaves) >= 1 and abs(delta - 12.0 * octaves) <= 1.5:
            cumulative -= 12.0 * octaves
        out[index] = pitch[index] + cumulative
    return out


def _wrap_octave(semitone: float) -> float:
    return semitone - 12.0 * round(semitone / 12.0)


def _wrap_octaves(semitones: np.ndarray) -> np.ndarray:
    """Map interval error into [-6, 6] so gender/octave is not a pitch error."""
    return semitones - 12.0 * np.rint(semitones / 12.0)


def _best_global_shift(differences: np.ndarray) -> float:
    """One transposition for the whole phrase, including octave (±12, ±24)."""
    median = float(np.median(differences))
    candidates = [median + 12.0 * step for step in (-2, -1, 0, 1, 2)]

    def cost(shift: float) -> tuple[float, float]:
        folded = _wrap_octaves(differences - shift)
        return float(np.median(np.abs(folded))), abs(shift - median)

    return min(candidates, key=cost)


def _dtw_pairs(reference: np.ndarray, student: np.ndarray) -> list[tuple[int, int]]:
    """DTW on octave-folded relative contour so male/female takes still align."""
    if reference.size == 0 or student.size == 0:
        return []
    ref_relative = _wrap_octaves(reference - np.median(reference))
    stu_relative = _wrap_octaves(student - np.median(student))
    n, m = len(reference), len(student)
    costs = np.full((n + 1, m + 1), np.inf)
    costs[0, 0] = 0
    parent = np.zeros((n + 1, m + 1), dtype=np.uint8)
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            local = abs(_wrap_octave(float(ref_relative[i - 1] - stu_relative[j - 1])))
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


def _thin_onsets(onsets: np.ndarray, min_gap: float = 0.28) -> np.ndarray:
    if onsets.size == 0:
        return onsets
    ordered = np.sort(onsets.astype(float))
    kept = [float(ordered[0])]
    for time in ordered[1:]:
        if time - kept[-1] >= min_gap:
            kept.append(float(time))
    return np.asarray(kept)


def _rhythm_score(
    reference: dict[str, Any],
    student: dict[str, Any],
    pairs: list[tuple[int, int]],
    n_ref: int,
    n_stu: int,
) -> float:
    ref_duration = max(0.1, float(reference.get("duration", 0)))
    stu_duration = max(0.1, float(student.get("duration", 0)))
    # Practice recording adds ~1.5s after the phrase; that tail is not dragging.
    tail_slack = 2.0
    if stu_duration < ref_duration * 0.88:
        duration_penalty = min(1.0, (ref_duration - stu_duration) / ref_duration)
    elif stu_duration > ref_duration + tail_slack:
        duration_penalty = min(1.0, (stu_duration - ref_duration - tail_slack) / ref_duration)
    else:
        duration_penalty = 0.0

    window = ref_duration + 0.35
    ref_onsets = _thin_onsets(
        np.asarray(reference.get("onsets", []), dtype=float)
    )
    stu_onsets = _thin_onsets(
        np.asarray(student.get("onsets", []), dtype=float)
    )
    ref_onsets = ref_onsets[ref_onsets <= window] if ref_onsets.size else ref_onsets
    stu_onsets = stu_onsets[stu_onsets <= window] if stu_onsets.size else stu_onsets
    if ref_onsets.size == 0:
        onset_score = 1.0
    elif stu_onsets.size == 0:
        onset_score = 0.35
    else:
        errors = [float(np.min(np.abs(stu_onsets - onset))) / ref_duration for onset in ref_onsets]
        missing = max(0, len(ref_onsets) - len(stu_onsets)) / len(ref_onsets)
        onset_score = math.exp(-5.0 * float(np.mean(errors))) * (1.0 - 0.25 * missing)

    warp_score = 1.0
    if pairs and n_ref > 1 and n_stu > 1:
        ref_idx = np.asarray([i for i, _ in pairs], dtype=float) / (n_ref - 1)
        stu_idx = np.asarray([j for _, j in pairs], dtype=float) / (n_stu - 1)
        warp_score = math.exp(-2.8 * float(np.median(np.abs(stu_idx - ref_idx))))

    combined = 0.45 * onset_score + 0.35 * warp_score + 0.20 * (1.0 - duration_penalty)
    return 100.0 * max(0.0, combined)


def score_features(reference: dict[str, Any], student: dict[str, Any]) -> dict[str, Any]:
    """Return transparent weighted scores or a confidence-gated rejection."""
    coverage = float(student.get("voiced_coverage", 0))
    rms_db = float(student.get("rms_db", -120))
    clipping = float(student.get("clipping_ratio", 0))
    flatness = float(student.get("spectral_flatness", 0))
    duration = float(student.get("duration", 0))
    voiced_seconds = coverage * max(0.0, duration)
    gate_reason: str | None = None
    if rms_db < -48:
        gate_reason = "Сигнал слишком тихий. Поднесите микрофон ближе и спойте ещё раз."
    elif voiced_seconds < 0.35 and coverage < 0.06:
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
                "voiced_seconds": round(voiced_seconds, 3),
                "rms_db": rms_db,
                "clipping_ratio": clipping,
                "spectral_flatness": flatness,
            },
        }

    _, ref_pitch = _voiced_track(reference)
    _, stu_pitch = _voiced_track(student)
    pairs = _dtw_pairs(ref_pitch, stu_pitch)
    min_pairs = 3 if min(len(ref_pitch), len(stu_pitch)) < 8 else 5
    if len(pairs) < min_pairs:
        return {
            "evaluable": False,
            "reason": "Не удалось уверенно сопоставить мелодию. Повторите короткую фразу.",
            "confidence": {"aligned_frames": len(pairs), "voiced_coverage": coverage},
        }

    differences = np.asarray([stu_pitch[j] - ref_pitch[i] for i, j in pairs], dtype=float)
    global_shift = _best_global_shift(differences)
    cents_error = np.abs(_wrap_octaves(differences - global_shift) * 100)
    # 180¢ → 0: ~20¢ tracker noise still scores ~89, a 2-semitone miss is 0.
    frame_quality = np.clip(1.0 - cents_error / 180.0, 0.0, 1.0)
    intonation = 100.0 * float(np.mean(frame_quality))
    rhythm = _rhythm_score(reference, student, pairs, len(ref_pitch), len(stu_pitch))
    ref_voiced_sec = max(
        0.35,
        float(reference.get("voiced_coverage", 0.05)) * max(0.1, float(reference.get("duration", 0))),
    )
    voiced_ratio = min(1.0, voiced_seconds / ref_voiced_sec)
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
        "global_shift_semitones": int(np.rint(global_shift)),
        "feedback": feedback,
        "confidence": {
            "aligned_frames": len(pairs),
            "voiced_coverage": coverage,
            "median_residual_cents": round(float(np.median(cents_error)), 1),
        },
    }
