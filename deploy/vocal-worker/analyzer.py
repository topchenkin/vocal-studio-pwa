# -*- coding: utf-8 -*-
"""Rhythm-game hitbox scoring for vocal exercises.

Teacher F0 is quantized into MIDI NoteBlocks. Student takes are scored by
50 ms frames against those hitboxes (SingStar / Guitar Hero), not DTW.
"""
from __future__ import annotations

import math
import os
import sys
import tempfile
from pathlib import Path
from typing import Any

import numpy as np

ANALYZER_VERSION = "hitbox-3"
SAMPLE_RATE = 16_000
DEFAULT_NUMBA_CACHE = "/var/cache/vocal-worker/numba"

FRAME_SEC = 0.05
TIMING_SLACK_SEC = 0.20
GREEN_CENTS = 60.0
NEAR_CENTS = 120.0
MIN_BLOCK_SEC = 0.08
VIBRATO_CENTS = 80.0
GAP_MERGE_SEC = 0.12
NOTE_NAMES = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")

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


def midi_to_note(midi: float) -> str:
    rounded = int(round(float(midi)))
    return f"{NOTE_NAMES[((rounded % 12) + 12) % 12]}{rounded // 12 - 1}"


def midi_to_hz(midi: float) -> float:
    return 440.0 * (2.0 ** ((float(midi) - 69.0) / 12.0))


def hz_to_cents(user_hz: float, target_hz: float) -> float:
    if user_hz <= 0 or target_hz <= 0:
        return 9999.0
    return 1200.0 * math.log2(user_hz / target_hz)


def pitch_class_cents(user_hz: float, target_hz: float) -> float:
    """Octave-blind distance in [0, 600]. 1190? folds to 10?."""
    if user_hz <= 0 or target_hz <= 0:
        return 9999.0
    user_cents = 1200.0 * math.log2(user_hz)
    target_cents = 1200.0 * math.log2(target_hz)
    diff = abs(user_cents - target_cents) % 1200.0
    if diff > 600.0:
        diff = 1200.0 - diff
    return diff


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

    features = {
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
    features["blocks"] = quantize_note_blocks(features)
    return features


def _unwrap_octave_jumps(pitch: np.ndarray) -> np.ndarray:
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


def quantize_note_blocks(features: dict[str, Any]) -> list[dict[str, Any]]:
    """Collapse raw F0 into Guitar-Hero note hitboxes. Vibrato stays one block."""
    times = [float(value) for value in features.get("times") or []]
    pitches = list(features.get("pitch_midi") or [])
    confidence = list(features.get("confidence") or [])
    while len(confidence) < len(pitches):
        confidence.append(0.0)

    voiced_t: list[float] = []
    voiced_m: list[float] = []
    for time, pitch, conf in zip(times, pitches, confidence):
        if pitch is None or float(conf) < 0.28:
            continue
        voiced_t.append(float(time))
        voiced_m.append(float(pitch))
    if not voiced_m:
        return []
    voiced_m = _unwrap_octave_jumps(np.asarray(voiced_m, dtype=float)).tolist()

    raw: list[dict[str, Any]] = []
    bucket_t: list[float] = []
    bucket_m: list[float] = []

    def flush() -> None:
        if len(bucket_t) < 1:
            return
        start = bucket_t[0]
        end = bucket_t[-1]
        duration = max(0.0, end - start)
        if duration < MIN_BLOCK_SEC and len(bucket_t) < 2:
            bucket_t.clear()
            bucket_m.clear()
            return
        median = float(np.median(bucket_m))
        midi = int(round(median))
        raw.append(
            {
                "note": midi_to_note(midi),
                "midi": midi,
                "startHz": round(midi_to_hz(midi), 2),
                "startTime": round(start, 3),
                "endTime": round(max(end, start + MIN_BLOCK_SEC), 3),
            }
        )
        bucket_t.clear()
        bucket_m.clear()

    for time, midi in zip(voiced_t, voiced_m):
        if not bucket_t:
            bucket_t.append(time)
            bucket_m.append(midi)
            continue
        gap = time - bucket_t[-1]
        center = float(np.median(bucket_m))
        cents = abs(midi - center) * 100.0
        same_note = round(midi) == round(center) or cents <= VIBRATO_CENTS
        if gap > GAP_MERGE_SEC and not same_note:
            flush()
            bucket_t.append(time)
            bucket_m.append(midi)
            continue
        if same_note or gap <= GAP_MERGE_SEC:
            if not same_note and gap <= GAP_MERGE_SEC:
                flush()
                bucket_t.append(time)
                bucket_m.append(midi)
                continue
            bucket_t.append(time)
            bucket_m.append(midi)
            continue
        flush()
        bucket_t.append(time)
        bucket_m.append(midi)
    flush()

    merged: list[dict[str, Any]] = []
    for block in raw:
        if (
            merged
            and block["midi"] == merged[-1]["midi"]
            and block["startTime"] - merged[-1]["endTime"] <= GAP_MERGE_SEC
        ):
            merged[-1]["endTime"] = block["endTime"]
        else:
            merged.append(block)
    return [block for block in merged if block["endTime"] - block["startTime"] >= MIN_BLOCK_SEC]


def shift_blocks(blocks: list[dict[str, Any]], semitones: int) -> list[dict[str, Any]]:
    shift = int(semitones)
    if shift == 0:
        return blocks
    factor = 2.0 ** (shift / 12.0)
    out: list[dict[str, Any]] = []
    for block in blocks:
        midi = int(block["midi"]) + shift
        out.append(
            {
                "note": midi_to_note(midi),
                "midi": midi,
                "startHz": round(float(block["startHz"]) * factor, 2),
                "startTime": block["startTime"],
                "endTime": block["endTime"],
            }
        )
    return out


def block_at(
    blocks: list[dict[str, Any]],
    time: float,
    slack: float = TIMING_SLACK_SEC,
) -> dict[str, Any] | None:
    inside = [
        block
        for block in blocks
        if float(block["startTime"]) <= time <= float(block["endTime"])
    ]
    if inside:
        return min(inside, key=lambda block: abs(time - (block["startTime"] + block["endTime"]) / 2))
    nearby = [
        block
        for block in blocks
        if float(block["startTime"]) - slack <= time <= float(block["endTime"]) + slack
    ]
    if not nearby:
        return None
    return min(
        nearby,
        key=lambda block: min(
            abs(time - float(block["startTime"])),
            abs(time - float(block["endTime"])),
        ),
    )


def _student_hz_at(times: list[float], hz: list[float | None], time: float) -> float | None:
    voiced = [(stamp, value) for stamp, value in zip(times, hz) if value is not None]
    if not voiced:
        return None
    lo: tuple[float, float] | None = None
    hi: tuple[float, float] | None = None
    for stamp, value in voiced:
        if stamp <= time:
            lo = (stamp, float(value))
        if stamp >= time and hi is None:
            hi = (stamp, float(value))
            break
    if lo and hi and hi[0] > lo[0] and hi[0] - lo[0] <= 0.35:
        mix = (time - lo[0]) / (hi[0] - lo[0])
        return lo[1] * (1.0 - mix) + hi[1] * mix
    if lo and time - lo[0] <= TIMING_SLACK_SEC:
        return lo[1]
    if hi and hi[0] - time <= TIMING_SLACK_SEC:
        return hi[1]
    return None


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
ABORTED = (
    "\u0424\u0440\u0430\u0437\u0430 \u043e\u0431\u043e\u0440\u0432\u0430\u043d\u0430 \u0441\u043b\u0438\u0448\u043a\u043e\u043c \u0440\u0430\u043d\u043e. "
    "\u0414\u043e\u043f\u043e\u0439\u0442\u0435 \u0435\u0451 \u0434\u043e \u043a\u043e\u043d\u0446\u0430."
)
FEEDBACK = {
    "intonation": (
        "\u0414\u0435\u0440\u0436\u0438\u0442\u0435 \u0433\u043e\u043b\u043e\u0441 \u0432\u043d\u0443\u0442\u0440\u0438 "
        "\u0437\u0435\u043b\u0451\u043d\u044b\u0445 \u0431\u043b\u043e\u043a\u043e\u0432 \u043d\u043e\u0442."
    ),
    "rhythm": (
        "\u0412\u0445\u043e\u0434\u0438\u0442\u0435 \u0432 \u0431\u043b\u043e\u043a \u0432\u043e\u0432\u0440\u0435\u043c\u044f. "
        "\u0414\u043e\u043f\u0443\u0441\u043a \u043d\u0430 \u0440\u0435\u0430\u043a\u0446\u0438\u044e 200 \u043c\u0441."
    ),
    "completeness": (
        "\u041f\u0440\u043e\u043f\u043e\u0439\u0442\u0435 \u0432\u0441\u0435 \u0437\u0435\u043b\u0451\u043d\u044b\u0435 "
        "\u0431\u043b\u043e\u043a\u0438 \u0434\u043e \u043a\u043e\u043d\u0446\u0430 \u0444\u0440\u0430\u0437\u044b."
    ),
}


def _unevaluable(reason: str, **confidence: Any) -> dict[str, Any]:
    return {
        "evaluable": False,
        "reason": reason,
        "confidence": confidence,
    }


def frame_points(cents: float | None) -> int:
    """Hitbox points for one 50 ms frame. Silence inside a block is a miss."""
    if cents is None:
        return 0
    error = abs(cents)
    if error <= GREEN_CENTS:
        return 100
    if error <= NEAR_CENTS:
        return 50
    return 0


def score_features(
    reference: dict[str, Any],
    student: dict[str, Any],
) -> dict[str, Any]:
    """Score a take against quantized teacher hitboxes. Octave-blind, no auto-key."""
    coverage = float(student.get("voiced_coverage", 0))
    rms_db = float(student.get("rms_db", -120))
    clipping = float(student.get("clipping_ratio", 0))
    flatness = float(student.get("spectral_flatness", 0))
    duration = float(student.get("duration") or reference.get("duration") or 0)
    voiced_seconds = coverage * max(0.0, duration)
    if rms_db < -48:
        return _unevaluable(TOO_QUIET, voiced_coverage=coverage, rms_db=rms_db)
    if voiced_seconds < 0.35 and coverage < 0.06:
        return _unevaluable(UNRECOGNIZED, voiced_coverage=coverage, rms_db=rms_db)
    if clipping > 0.015:
        return _unevaluable(CLIPPED, clipping_ratio=clipping)
    if flatness > 0.55 and coverage < 0.3:
        return _unevaluable(NOISY, spectral_flatness=flatness)

    raw_blocks = reference.get("blocks")
    blocks = list(raw_blocks) if isinstance(raw_blocks, list) and raw_blocks else quantize_note_blocks(reference)
    if len(blocks) < 1:
        return _unevaluable(WEAK_REFERENCE, blocks=0)

    times = [float(value) for value in student.get("times") or []]
    midis = list(student.get("pitch_midi") or [])
    student_hz: list[float | None] = []
    for midi in midis:
        student_hz.append(None if midi is None else midi_to_hz(float(midi)))

    end = max(
        duration,
        max((float(block["endTime"]) for block in blocks), default=0.0),
    )

    earned = 0
    possible = 0
    green = 0
    near = 0
    miss = 0
    voiced_hits = 0
    t = 0.0
    while t <= end + 1e-9:
        block = block_at(blocks, t, slack=0)
        if block is None:
            t += FRAME_SEC
            continue
        possible += 100
        hz = _student_hz_at(times, student_hz, t)
        if hz is None:
            miss += 1
            t += FRAME_SEC
            continue
        voiced_hits += 1
        cents = pitch_class_cents(hz, float(block["startHz"]))
        points = frame_points(cents)
        earned += points
        if points >= 100:
            green += 1
        elif points >= 50:
            near += 1
        else:
            miss += 1
        t += FRAME_SEC

    if possible <= 0:
        return _unevaluable(WEAK_REFERENCE, blocks=len(blocks))
    if voiced_hits < 3 or voiced_hits < 0.25 * max(1, possible // 100):
        return _unevaluable(ABORTED, voiced_hits=voiced_hits, possible=possible)

    overall = int(round(100.0 * earned / possible))
    intonation = overall
    completeness = int(round(100.0 * voiced_hits / max(1, possible // 100)))
    rhythm = 100
    weakest = min(
        ("intonation", intonation),
        ("completeness", completeness),
        key=lambda item: item[1],
    )[0]
    return {
        "evaluable": True,
        "overall": int(np.clip(overall, 0, 100)),
        "intonation": int(np.clip(intonation, 0, 100)),
        "rhythm": rhythm,
        "completeness": int(np.clip(completeness, 0, 100)),
        "global_shift_semitones": 0,
        "feedback": FEEDBACK[weakest],
        "confidence": {
            "blocks": len(blocks),
            "earned": earned,
            "possible": possible,
            "green_frames": green,
            "near_frames": near,
            "miss_frames": miss,
            "voiced_hits": voiced_hits,
        },
    }


def score_with_anchors(
    reference: dict[str, Any],
    student: dict[str, Any],
    anchors: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Hitbox scoring ignores few-shot anchors; kept for worker call compatibility."""
    _ = anchors
    return score_features(reference, student)
