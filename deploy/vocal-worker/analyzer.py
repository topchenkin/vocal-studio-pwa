# -*- coding: utf-8 -*-
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

ANALYZER_VERSION = "vocal-score-5"
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


def extract_features(
    path: str,
    offset: float = 0,
    duration: float | None = None,
    *,
    yin_fill: bool = True,
) -> dict[str, Any]:
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
    voicing_min = 0.26 if yin_fill else 0.48
    voiced = (
        np.asarray(voiced_flag, dtype=bool)
        & np.isfinite(f0)
        & (probability >= voicing_min)
    )
    frame_rms = librosa.feature.rms(
        y=normalized, frame_length=frame_length, hop_length=hop
    )[0]
    if frame_rms.size < f0.size:
        frame_rms = np.pad(frame_rms, (0, f0.size - frame_rms.size))
    elif frame_rms.size > f0.size:
        frame_rms = frame_rms[: f0.size]
    frame_db = 20 * np.log10(np.maximum(frame_rms, 1e-8))
    # YIN fills phone takes that pYIN misses. Never use it on the teacher
    # stem: it happily tracks leaked piano as if it were sung melody.
    if yin_fill and (voiced.size == 0 or float(np.mean(voiced)) < 0.08):
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
    """Remove isolated +/-12/24 tracker jumps; keep real melodic motion."""
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
    """One transposition for the whole phrase, including octave (+/-12, +/-24)."""
    median = float(np.median(differences))
    candidates = [median + 12.0 * step for step in (-2, -1, 0, 1, 2)]

    def cost(shift: float) -> tuple[float, float]:
        folded = _wrap_octaves(differences - shift)
        return float(np.median(np.abs(folded))), abs(shift - median)

    return min(candidates, key=cost)


def _note_events(features: dict[str, Any]) -> list[dict[str, float]]:
    """Median pitch of each sung island. Slides stay one note; piano rests are gaps."""
    times = [float(value) for value in features.get("times") or []]
    pitches = list(features.get("pitch_midi") or [])
    confidence = list(features.get("confidence") or [])
    while len(confidence) < len(pitches):
        confidence.append(0.0)
    hop = 0.05
    if len(times) >= 2:
        hop = max(0.03, (times[-1] - times[0]) / max(1, len(times) - 1))

    notes: list[dict[str, float]] = []
    bucket: list[tuple[float, float]] = []

    def flush() -> None:
        if len(bucket) < 1:
            return
        start, end = bucket[0][0], bucket[-1][0]
        duration = max(hop, end - start + hop)
        if duration < 0.08 and len(bucket) < 2:
            return
        midi = float(np.median([pitch for _, pitch in bucket]))
        notes.append({"t": start, "end": end + hop, "dur": duration, "midi": midi})

    last_time: float | None = None
    for time, pitch, conf in zip(times, pitches, confidence):
        voiced = pitch is not None and float(conf) >= 0.3
        if not voiced:
            flush()
            bucket = []
            last_time = None
            continue
        midi = float(pitch)
        if last_time is not None and time - last_time > 0.38:
            flush()
            bucket = []
        if bucket:
            prev = bucket[-1][1]
            if abs(midi - prev) > 1.15:
                flush()
                bucket = []
            else:
                center = float(np.median([item[1] for item in bucket]))
                if abs(midi - center) > 2.8:
                    flush()
                    bucket = []
        bucket.append((time, midi))
        last_time = time
    flush()
    return notes


def _rest_intervals(features: dict[str, Any], min_dur: float = 0.4) -> list[tuple[float, float]]:
    times = [float(value) for value in features.get("times") or []]
    pitches = list(features.get("pitch_midi") or [])
    if not times:
        return []
    rests: list[tuple[float, float]] = []
    start: float | None = None
    last_unvoiced = times[0]
    for time, pitch in zip(times, pitches):
        if pitch is None:
            if start is None:
                start = time
            last_unvoiced = time
        else:
            if start is not None and last_unvoiced - start >= min_dur:
                rests.append((start, last_unvoiced))
            start = None
    if start is not None and last_unvoiced - start >= min_dur:
        rests.append((start, last_unvoiced))
    duration = float(features.get("duration") or (times[-1] if times else 0))
    if times and times[0] > min_dur:
        rests.append((0.0, times[0]))
    if duration - (times[-1] if times else 0) > min_dur:
        rests.append((times[-1], duration))
    return rests


def _overlaps_rest(note: dict[str, float], rests: list[tuple[float, float]]) -> bool:
    for start, end in rests:
        overlap = min(note["end"], end) - max(note["t"], start)
        if overlap > 0.2 and overlap >= 0.45 * note["dur"]:
            return True
    return False


def _melody_notes(
    notes: list[dict[str, float]],
    rests: list[tuple[float, float]],
) -> list[dict[str, float]]:
    return [note for note in notes if not _overlaps_rest(note, rests)]


def _dtw_note_pairs(
    ref_notes: list[dict[str, float]],
    stu_notes: list[dict[str, float]],
) -> list[tuple[int, int]]:
    if not ref_notes or not stu_notes:
        return []
    ref_pitch = np.asarray([note["midi"] for note in ref_notes], dtype=float)
    stu_pitch = np.asarray([note["midi"] for note in stu_notes], dtype=float)
    ref_rel = _wrap_octaves(ref_pitch - np.median(ref_pitch))
    stu_rel = _wrap_octaves(stu_pitch - np.median(stu_pitch))
    ref_t = np.asarray([note["t"] for note in ref_notes], dtype=float)
    stu_t = np.asarray([note["t"] for note in stu_notes], dtype=float)
    ref_span = max(0.25, float(ref_t[-1] - ref_t[0]) if len(ref_t) > 1 else 1.0)
    stu_span = max(0.25, float(stu_t[-1] - stu_t[0]) if len(stu_t) > 1 else 1.0)
    ref_tn = (ref_t - ref_t[0]) / ref_span
    stu_tn = (stu_t - stu_t[0]) / stu_span
    n, m = len(ref_notes), len(stu_notes)
    costs = np.full((n + 1, m + 1), np.inf)
    costs[0, 0] = 0
    parent = np.zeros((n + 1, m + 1), dtype=np.uint8)
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            pitch_cost = abs(_wrap_octave(float(ref_rel[i - 1] - stu_rel[j - 1])))
            time_cost = 2.2 * abs(float(ref_tn[i - 1] - stu_tn[j - 1]))
            local = pitch_cost + time_cost
            choices = (costs[i - 1, j - 1], costs[i - 1, j] + 0.35, costs[i, j - 1] + 0.35)
            move = int(np.argmin(choices))
            costs[i, j] = local + choices[move]
            parent[i, j] = move
    pairs: list[tuple[int, int]] = []
    i, j = n, m
    while i > 0 and j > 0:
        move = int(parent[i, j])
        if move == 0:
            pairs.append((i - 1, j - 1))
            i -= 1
            j -= 1
        elif move == 1:
            i -= 1
        else:
            j -= 1
    pairs.reverse()
    seen_i: set[int] = set()
    seen_j: set[int] = set()
    unique: list[tuple[int, int]] = []
    for i, j in pairs:
        if i in seen_i or j in seen_j:
            continue
        seen_i.add(i)
        seen_j.add(j)
        unique.append((i, j))
    return unique


# Karaoke tolerance: inside +/- 1 semitone is the same note. Two human takes of
# the same phrase cannot match more tightly, including the teacher re-singing it.
IN_TUNE_CENTS = 100.0
FAIL_CENTS = 300.0
ONSET_SLACK_SEC = 0.22
ONSET_FAIL_SEC = 0.85


def _note_quality(error_semitones: float) -> float:
    """Correct sung note = 1. Anything inside the +/-100 cent window is full credit."""
    error_cents = abs(_wrap_octave(error_semitones)) * 100.0
    if error_cents <= IN_TUNE_CENTS:
        return 1.0
    if error_cents >= FAIL_CENTS:
        return 0.0
    return max(0.0, 1.0 - (error_cents - IN_TUNE_CENTS) / (FAIL_CENTS - IN_TUNE_CENTS))


def _voiced_midis(features: dict[str, Any]) -> np.ndarray:
    return np.asarray(
        [float(value) for value in (features.get("pitch_midi") or []) if value is not None],
        dtype=float,
    )


UNRECOGNIZED = (
    "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0440\u0430\u0441\u043f\u043e\u0437\u043d\u0430\u0442\u044c "
    "\u0432\u043e\u043a\u0430\u043b\u044c\u043d\u0443\u044e \u043c\u0435\u043b\u043e\u0434\u0438\u044e. "
    "\u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437 \u0441\u043f\u0435\u0442\u044c \u0444\u0440\u0430\u0437\u0443."
)
TOO_QUIET = (
    "\u0421\u043b\u0438\u0448\u043a\u043e\u043c \u0442\u0438\u0445\u043e\u0435 \u0430\u0443\u0434\u0438\u043e. "
    "\u041f\u0440\u0438\u0434\u0432\u0438\u043d\u044c\u0442\u0435\u0441\u044c \u0431\u043b\u0438\u0436\u0435 \u043a \u043c\u0438\u043a\u0440\u043e\u0444\u043e\u043d\u0443 "
    "\u0438\u043b\u0438 \u0441\u043f\u043e\u0439\u0442\u0435 \u0433\u0440\u043e\u043c\u0447\u0435."
)
CLIPPED = (
    "\u0417\u0430\u043f\u0438\u0441\u044c \u043f\u0435\u0440\u0435\u0433\u0440\u0443\u0436\u0435\u043d\u0430. "
    "\u0423\u043c\u0435\u043d\u044c\u0448\u0438\u0442\u0435 \u0433\u0440\u043e\u043c\u043a\u043e\u0441\u0442\u044c \u043d\u0430 \u043c\u0438\u043a\u0440\u043e\u0444\u043e\u043d\u0435."
)
NOISY = (
    "\u0412 \u0437\u0430\u043f\u0438\u0441\u0438 \u0441\u043b\u0438\u0448\u043a\u043e\u043c \u043c\u043d\u043e\u0433\u043e \u0448\u0443\u043c\u0430 "
    "\u0438\u043b\u0438 \u043f\u043e\u0441\u0442\u043e\u0440\u043e\u043d\u043d\u0438\u0445 \u0437\u0432\u0443\u043a\u043e\u0432."
)
WEAK_REFERENCE = (
    "\u0412 \u044d\u0442\u0430\u043b\u043e\u043d\u043d\u043e\u0439 \u0444\u0440\u0430\u0437\u0435 \u0441\u043b\u0438\u0448\u043a\u043e\u043c \u043c\u0430\u043b\u043e \u043d\u043e\u0442, "
    "\u0447\u0442\u043e\u0431\u044b \u043e\u0446\u0435\u043d\u0438\u0432\u0430\u0442\u044c \u043c\u0435\u043b\u043e\u0434\u0438\u044e."
)
DRONE = (
    "\u042d\u0442\u043e \u043f\u043e\u0445\u043e\u0436\u0435 \u043d\u0430 \u043e\u0434\u043d\u0443 \u043d\u043e\u0442\u0443, "
    "\u0430 \u0432 \u044d\u0442\u0430\u043b\u043e\u043d\u0435 \u043c\u0435\u043b\u043e\u0434\u0438\u044f \u0434\u0432\u0438\u0436\u0435\u0442\u0441\u044f."
)
ABORTED = (
    "\u0424\u0440\u0430\u0437\u0430 \u043e\u0431\u043e\u0440\u0432\u0430\u043d\u0430 \u0441\u043b\u0438\u0448\u043a\u043e\u043c \u0440\u0430\u043d\u043e. "
    "\u0414\u043e\u043f\u043e\u0439\u0442\u0435 \u0435\u0451 \u0434\u043e \u043a\u043e\u043d\u0446\u0430."
)
FEEDBACK = {
    "intonation": (
        "\u0414\u0435\u0440\u0436\u0438\u0442\u0435 \u043d\u043e\u0442\u044b \u0431\u043b\u0438\u0436\u0435 \u043a \u043a\u043e\u043d\u0442\u0443\u0440\u0443 "
        "\u0438 \u0434\u0432\u0438\u0433\u0430\u0439\u0442\u0435\u0441\u044c \u0432\u043c\u0435\u0441\u0442\u0435 \u0441\u043e \u0444\u0440\u0430\u0437\u043e\u0439."
    ),
    "rhythm": (
        "\u041f\u043e\u0439\u043c\u0430\u0439\u0442\u0435 \u0442\u043e\u0447\u043d\u0435\u0435 \u0432\u0441\u0442\u0443\u043f\u043b\u0435\u043d\u0438\u044f "
        "\u043f\u0435\u0432\u0447\u0435\u0441\u043a\u0438\u0445 \u043d\u043e\u0442 \u043f\u043e \u0432\u0440\u0435\u043c\u0435\u043d\u0438."
    ),
    "completeness": (
        "\u0414\u043e\u043f\u043e\u0439\u0442\u0435 \u0432\u043e\u043a\u0430\u043b\u044c\u043d\u044b\u0435 \u043a\u0443\u0441\u043a\u0438 "
        "\u0438 \u043f\u043e\u043c\u043e\u043b\u0447\u0438\u0442\u0435 \u043d\u0430 \u043f\u0430\u0443\u0437\u0430\u0445 \u0444\u043e\u0440\u0442\u0435\u043f\u0438\u0430\u043d\u043e."
    ),
}
BAND_CENTER = {"high": 90.0, "mid": 65.0, "low": 28.0}


def _unevaluable(reason: str, **confidence: Any) -> dict[str, Any]:
    return {
        "evaluable": False,
        "reason": reason,
        "confidence": confidence,
    }


def _garbage_reason(
    reference: dict[str, Any],
    student: dict[str, Any],
    ref_notes: list[dict[str, float]],
    stu_notes: list[dict[str, float]],
) -> str | None:
    """Reject only silence-like aborts and a true drone against a moving melody.

    Humming, sparse outlines and off-contour singing must still receive a score.
    """
    if len(ref_notes) < 3:
        return WEAK_REFERENCE
    ref_voiced = sum(note["dur"] for note in ref_notes)
    stu_voiced = sum(note["dur"] for note in stu_notes)
    if stu_voiced < 0.28 * max(0.4, ref_voiced):
        return ABORTED
    ref_m = _voiced_midis(reference)
    stu_m = _voiced_midis(student)
    if (
        ref_m.size >= 8
        and float(np.ptp(ref_m)) >= 4.0
        and stu_m.size >= 8
        and float(np.ptp(stu_m)) < 1.6
    ):
        return DRONE
    return None


def _rest_silence_score(
    rest: list[tuple[float, float]],
    stu_notes: list[dict[str, float]],
) -> float:
    if not rest:
        return 1.0
    rest_dur = sum(max(0.0, end - start) for start, end in rest)
    if rest_dur < 0.4:
        return 1.0
    sung = 0.0
    for note in stu_notes:
        for start, end in rest:
            overlap = min(note["end"], end) - max(note["t"], start)
            if overlap > 0:
                sung += overlap
    return max(0.0, 1.0 - min(1.0, sung / rest_dur))


def _rhythm_from_notes(
    ref_notes: list[dict[str, float]],
    stu_notes: list[dict[str, float]],
    pairs: list[tuple[int, int]],
    ref_duration: float,
    stu_duration: float,
) -> float:
    tail_slack = 2.0
    if stu_duration < ref_duration * 0.88:
        duration_penalty = min(1.0, (ref_duration - stu_duration) / ref_duration)
    elif stu_duration > ref_duration + tail_slack:
        duration_penalty = min(1.0, (stu_duration - ref_duration - tail_slack) / ref_duration)
    else:
        duration_penalty = 0.0
    if not pairs:
        return 100.0 * max(0.0, 0.35 * (1.0 - duration_penalty))
    offsets = [float(stu_notes[j]["t"] - ref_notes[i]["t"]) for i, j in pairs]
    global_delay = float(np.median(offsets))
    mean_err = float(
        np.mean(
            [
                abs(float(stu_notes[j]["t"] - ref_notes[i]["t"] - global_delay))
                for i, j in pairs
            ]
        )
    )
    if mean_err <= ONSET_SLACK_SEC:
        onset_score = 1.0
    elif mean_err >= ONSET_FAIL_SEC:
        onset_score = 0.0
    else:
        onset_score = 1.0 - (mean_err - ONSET_SLACK_SEC) / (ONSET_FAIL_SEC - ONSET_SLACK_SEC)
    return 100.0 * max(0.0, 0.7 * onset_score + 0.3 * (1.0 - duration_penalty))


def _shape_corr(ref_notes: list[dict[str, float]], stu_notes: list[dict[str, float]]) -> float:
    """Relative melody shape after time-normalizing each take. Ignores DTW cherry-picks."""
    if len(ref_notes) < 4 or len(stu_notes) < 4:
        return 1.0

    def series(notes: list[dict[str, float]]) -> np.ndarray:
        times = np.asarray([note["t"] for note in notes], dtype=float)
        pitch = np.asarray([note["midi"] for note in notes], dtype=float)
        span = max(0.2, float(times[-1] - times[0]))
        tn = (times - times[0]) / span
        rel = _wrap_octaves(pitch - np.median(pitch))
        grid = np.linspace(0.0, 1.0, 24)
        return np.interp(grid, tn, rel)

    reference = series(ref_notes)
    student = series(stu_notes)
    if float(np.std(reference)) < 0.35:
        return 1.0
    corr = float(np.corrcoef(reference, student)[0, 1])
    return corr if np.isfinite(corr) else 0.0


def score_features(reference: dict[str, Any], student: dict[str, Any]) -> dict[str, Any]:
    """Score sung or hummed notes vs teacher vocal melody. Loudness and manner are ignored."""
    coverage = float(student.get("voiced_coverage", 0))
    rms_db = float(student.get("rms_db", -120))
    clipping = float(student.get("clipping_ratio", 0))
    flatness = float(student.get("spectral_flatness", 0))
    duration = float(student.get("duration", 0))
    voiced_seconds = coverage * max(0.0, duration)
    if rms_db < -48:
        return _unevaluable(
            TOO_QUIET,
            voiced_coverage=coverage,
            voiced_seconds=round(voiced_seconds, 3),
            rms_db=rms_db,
            clipping_ratio=clipping,
            spectral_flatness=flatness,
        )
    if voiced_seconds < 0.35 and coverage < 0.06:
        return _unevaluable(
            UNRECOGNIZED,
            voiced_coverage=coverage,
            voiced_seconds=round(voiced_seconds, 3),
            rms_db=rms_db,
            clipping_ratio=clipping,
            spectral_flatness=flatness,
        )
    if clipping > 0.015:
        return _unevaluable(
            CLIPPED,
            voiced_coverage=coverage,
            voiced_seconds=round(voiced_seconds, 3),
            rms_db=rms_db,
            clipping_ratio=clipping,
            spectral_flatness=flatness,
        )
    if flatness > 0.55 and coverage < 0.3:
        return _unevaluable(
            NOISY,
            voiced_coverage=coverage,
            voiced_seconds=round(voiced_seconds, 3),
            rms_db=rms_db,
            clipping_ratio=clipping,
            spectral_flatness=flatness,
        )

    rests = _rest_intervals(reference)
    ref_notes = _note_events(reference)
    stu_all = _note_events(student)
    stu_notes = _melody_notes(stu_all, rests)
    garbage = _garbage_reason(reference, student, ref_notes, stu_notes)
    if garbage:
        return _unevaluable(
            garbage,
            voiced_coverage=coverage,
            ref_notes=len(ref_notes),
            stu_notes=len(stu_notes),
        )

    pairs = _dtw_note_pairs(ref_notes, stu_notes)
    matched = {i for i, _ in pairs}
    rest_score = _rest_silence_score(rests, stu_all)
    coverage_notes = min(1.0, len(matched) / max(1, len(ref_notes)))
    global_shift = 0.0
    cents_error = np.asarray([0.0])
    paired_corr: float | None = None

    if pairs:
        differences = np.asarray(
            [stu_notes[j]["midi"] - ref_notes[i]["midi"] for i, j in pairs],
            dtype=float,
        )
        global_shift = _best_global_shift(differences)
        qualities = [
            _note_quality(float(stu_notes[j]["midi"] - ref_notes[i]["midi"] - global_shift))
            for i, j in pairs
        ]
        melody = 100.0 * float(np.mean(qualities))
        paired_ref = np.asarray([ref_notes[i]["midi"] for i, _ in pairs], dtype=float)
        paired_stu = np.asarray(
            [stu_notes[j]["midi"] - global_shift for _, j in pairs],
            dtype=float,
        )
        if len(pairs) >= 4 and float(np.std(_wrap_octaves(paired_ref - np.median(paired_ref)))) > 0.35:
            paired_corr = float(
                np.corrcoef(
                    _wrap_octaves(paired_ref - np.median(paired_ref)),
                    _wrap_octaves(paired_stu - np.median(paired_ref)),
                )[0, 1]
            )
            if not np.isfinite(paired_corr) or paired_corr < 0.18:
                melody = min(melody, 38.0 * max(0.0, (float(paired_corr or 0.0) + 1.0) / 1.18))
        cents_error = np.abs(_wrap_octaves(differences - global_shift) * 100)
    else:
        melody = 18.0

    shape = _shape_corr(ref_notes, stu_notes)
    if len(ref_notes) >= 4 and len(stu_notes) >= 4 and shape < 0.22:
        melody = min(melody, 38.0 * max(0.0, (shape + 1.0) / 1.22))
    if len(pairs) < min(3, len(ref_notes)) or coverage_notes < 0.32:
        melody = min(melody, 42.0)

    rhythm = _rhythm_from_notes(
        ref_notes,
        stu_notes,
        pairs,
        max(0.1, float(reference.get("duration", 0))),
        max(0.1, duration),
    )
    completeness = 100.0 * (
        0.7 * min(1.0, coverage_notes / 0.88) + 0.3 * rest_score
    )

    melody_i = int(round(np.clip(melody, 0, 100)))
    rhythm_i = int(round(np.clip(rhythm, 0, 100)))
    completeness_i = int(round(np.clip(completeness, 0, 100)))
    overall = int(round(0.5 * melody_i + 0.3 * rhythm_i + 0.2 * completeness_i))
    weakest = min(
        ("intonation", melody_i),
        ("rhythm", rhythm_i),
        ("completeness", completeness_i),
        key=lambda item: item[1],
    )[0]
    return {
        "evaluable": True,
        "overall": overall,
        "intonation": melody_i,
        "rhythm": rhythm_i,
        "completeness": completeness_i,
        "global_shift_semitones": int(np.rint(global_shift)),
        "feedback": FEEDBACK[weakest],
        "confidence": {
            "aligned_notes": len(pairs),
            "voiced_coverage": coverage,
            "median_residual_cents": round(float(np.median(cents_error)), 1),
            "rest_silence": round(rest_score, 3),
            "contour_corr": None if not np.isfinite(shape) else round(float(shape), 3),
            "paired_corr": None if paired_corr is None or not np.isfinite(paired_corr) else round(float(paired_corr), 3),
        },
    }


def _softmax(values: np.ndarray, temperature: float = 12.0) -> np.ndarray:
    scaled = np.asarray(values, dtype=float) / max(1e-6, temperature)
    scaled = scaled - float(np.max(scaled))
    exp = np.exp(scaled)
    total = float(np.sum(exp))
    if total <= 0:
        return np.full(len(values), 1.0 / max(1, len(values)))
    return exp / total


def _anchor_interpolated(usable: dict[str, float]) -> float:
    bands = [band for band in ("high", "mid", "low") if band in usable]
    if not bands:
        return 50.0
    sims = np.asarray([usable[band] for band in bands], dtype=float)
    if len(bands) == 1:
        peak = float(np.clip(sims[0], 0, 100)) / 100.0
        return float(BAND_CENTER[bands[0]]) * peak + 50.0 * (1.0 - peak)
    weights = _softmax(sims)
    return float(sum(float(weights[index]) * BAND_CENTER[band] for index, band in enumerate(bands)))


def score_with_anchors(
    reference: dict[str, Any],
    student: dict[str, Any],
    anchors: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Blend stem-vs-student score with optional high/mid/low few-shot examples."""
    stem = score_features(reference, student)
    usable: dict[str, float] = {}
    for band, features in (anchors or {}).items():
        if band not in BAND_CENTER or not isinstance(features, dict):
            continue
        compared = score_features(features, student)
        if compared.get("evaluable"):
            usable[band] = float(compared["overall"])
        else:
            shape = _shape_corr(_note_events(features), _note_events(student))
            usable[band] = float(np.clip(50.0 * (shape + 1.0), 0, 100))
    if not usable or not stem.get("evaluable"):
        return stem
    interpolated = _anchor_interpolated(usable)
    blended = int(round(np.clip(0.5 * float(stem["overall"]) + 0.5 * interpolated, 0, 100)))
    result = dict(stem)
    result["overall"] = blended
    result["confidence"] = {
        **dict(stem.get("confidence") or {}),
        "anchor_score": round(interpolated, 1),
        "anchor_sims": {band: round(score, 1) for band, score in usable.items()},
    }
    return result
