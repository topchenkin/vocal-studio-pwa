"""Durable Supabase-backed worker for vocal exercise analysis."""
from __future__ import annotations

import hashlib
import json
import logging
import mimetypes
import os
import re
import shutil
import subprocess
import tempfile
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote

import requests
from gradio_client import Client, handle_file

from analyzer import ANALYZER_VERSION, extract_features, score_with_anchors

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
HF_TOKEN = os.environ.get("HUGGINGFACE_API_KEY", "").strip()
DEMUCS_SPACE = os.environ.get("DEMUCS_HF_SPACE", "abidlabs/music-separation").strip()
POLL_SECONDS = float(os.environ.get("POLL_SECONDS", "3"))
HEADERS = {
    "apikey": SERVICE_KEY,
    "authorization": f"Bearer {SERVICE_KEY}",
}

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("vocal-worker")
PUBLIC_FAILURE = "Не удалось обработать запись. Нажмите «Повторить»."
_INTERNAL_ERROR = re.compile(
    r"(/opt/|/usr/|/home/|site-packages|\.venv|Traceback|numba|librosa|"
    r"llvmlite|locator|cannot cache function)",
    re.I,
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def public_error(error: BaseException) -> str:
    text = str(error).strip()
    if not text or _INTERNAL_ERROR.search(text) or re.search(r"[A-Za-z]:\\|/(tmp|var)/", text):
        return PUBLIC_FAILURE
    return text[:300]


def rest(method: str, path: str, **kwargs: Any) -> requests.Response:
    headers = {**HEADERS, **kwargs.pop("headers", {})}
    response = requests.request(
        method,
        f"{SUPABASE_URL}{path}",
        headers=headers,
        timeout=kwargs.pop("timeout", 180),
        **kwargs,
    )
    if not response.ok:
        raise RuntimeError(f"{method} {path}: {response.status_code} {response.text[:500]}")
    return response


def rpc(name: str, payload: dict[str, Any] | None = None) -> Any:
    response = rest(
        "POST",
        f"/rest/v1/rpc/{name}",
        json=payload or {},
        headers={"content-type": "application/json"},
    )
    return response.json() if response.content else None


def patch(table: str, row_id: str, payload: dict[str, Any]) -> None:
    rest(
        "PATCH",
        f"/rest/v1/{table}?id=eq.{row_id}",
        json=payload,
        headers={"content-type": "application/json", "Prefer": "return=minimal"},
    )


def select(path: str) -> list[dict[str, Any]]:
    return rest("GET", f"/rest/v1/{path}").json()


def download(bucket: str, storage_path: str, destination: Path) -> None:
    response = rest(
        "GET",
        f"/storage/v1/object/{quote(bucket)}/{quote(storage_path, safe='/')}",
        timeout=600,
        stream=True,
    )
    with destination.open("wb") as output:
        for chunk in response.iter_content(1024 * 1024):
            output.write(chunk)


def upload(bucket: str, storage_path: str, source: Path, content_type: str) -> None:
    with source.open("rb") as body:
        rest(
            "POST",
            f"/storage/v1/object/{quote(bucket)}/{quote(storage_path, safe='/')}",
            data=body,
            timeout=600,
            headers={
                "content-type": content_type,
                "x-upsert": "true",
            },
        )


def remove(bucket: str, storage_path: str) -> None:
    rest(
        "DELETE",
        f"/storage/v1/object/{quote(bucket)}",
        json={"prefixes": [storage_path]},
        headers={"content-type": "application/json"},
    )


def probe_duration(path: Path) -> float:
    completed = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=60,
    )
    return float(completed.stdout.strip())


def to_wav(source: Path, destination: Path) -> None:
    subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
            "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(destination),
        ],
        check=True,
        timeout=180,
    )


def slice_wav(source: Path, destination: Path, start: float, duration: float) -> None:
    subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-ss", f"{max(0.0, start):.3f}", "-t", f"{max(0.05, duration):.3f}",
            "-i", str(source),
            "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(destination),
        ],
        check=True,
        timeout=120,
    )


def _gradio_file(item: Any) -> str | None:
    if item is None:
        return None
    if isinstance(item, dict):
        return item.get("path") or item.get("url") or item.get("name")
    text = str(item).strip()
    return text or None


def _copy_audio(source: str, destination: Path) -> None:
    if source.startswith(("http://", "https://")):
        response = requests.get(source, headers={"Authorization": f"Bearer {HF_TOKEN}"}, timeout=600)
        response.raise_for_status()
        destination.write_bytes(response.content)
        return
    shutil.copyfile(source, destination)


def demucs_stems(source: Path, vocals_dest: Path, instrumental_dest: Path) -> bool:
    """Separate vocals; save accompaniment/minus when Demucs returns it."""
    if not HF_TOKEN:
        raise RuntimeError("HUGGINGFACE_API_KEY is missing")
    client = Client(DEMUCS_SPACE, hf_token=HF_TOKEN, verbose=False)
    result = client.predict(handle_file(str(source)), api_name="/inference")
    outputs = result if isinstance(result, (tuple, list)) else [result]
    if not outputs:
        raise RuntimeError("Demucs returned no outputs")
    vocal = _gradio_file(outputs[0])
    if not vocal:
        raise RuntimeError("Demucs returned no vocal stem")
    _copy_audio(vocal, vocals_dest)
    extras = [_gradio_file(item) for item in outputs[1:] if _gradio_file(item)]
    if not extras:
        return False
    try:
        if len(extras) == 1:
            _copy_audio(extras[0], instrumental_dest)
            return True
        parts: list[Path] = []
        for index, extra in enumerate(extras):
            part = instrumental_dest.with_name(f"stem-{index}{instrumental_dest.suffix}")
            _copy_audio(extra, part)
            parts.append(part)
        mix = [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        ]
        for part in parts:
            mix.extend(["-i", str(part)])
        mix.extend(
            [
                "-filter_complex", f"amix=inputs={len(parts)}:duration=longest:normalize=0",
                "-ac", "1", str(instrumental_dest),
            ]
        )
        subprocess.run(mix, check=True, timeout=180)
        return True
    except Exception:
        log.exception("instrumental stem was not saved")
        return False


def process_analysis(job: dict[str, Any]) -> None:
    job_id = job["id"]
    try:
        with tempfile.TemporaryDirectory(prefix="uvs-analysis-") as temp:
            root = Path(temp)
            if job["status"] == "separating":
                source = root / "source"
                vocal_raw = root / "vocals"
                vocal_wav = root / "vocals.wav"
                instrumental_raw = root / "instrumental"
                instrumental_wav = root / "instrumental.wav"
                download("exercise-media", job["source_storage_path"], source)
                duration = probe_duration(source)
                if duration < 30 or duration > 660:
                    raise ValueError("Исходная запись должна длиться от 30 секунд до 10 минут")
                sha256 = hashlib.sha256(source.read_bytes()).hexdigest()
                patch("exercise_analysis_jobs", job_id, {"progress": 15, "source_sha256": sha256})
                has_minus = demucs_stems(source, vocal_raw, instrumental_raw)
                patch("exercise_analysis_jobs", job_id, {"progress": 58})
                to_wav(vocal_raw, vocal_wav)
                vocal_path = f"{job['exercise_id']}/{sha256[:16]}/vocals.wav"
                upload("exercise-analysis", vocal_path, vocal_wav, "audio/wav")
                payload: dict[str, Any] = {
                    "status": "awaiting_phrase_review",
                    "progress": 70,
                    "vocal_storage_path": vocal_path,
                    "duration_sec": round(duration, 3),
                    "analyzer_version": ANALYZER_VERSION,
                    "error": None,
                    "locked_at": None,
                }
                if has_minus and instrumental_raw.exists() and instrumental_raw.stat().st_size > 0:
                    to_wav(instrumental_raw, instrumental_wav)
                    instrumental_path = f"{job['exercise_id']}/{sha256[:16]}/instrumental.wav"
                    upload("exercise-analysis", instrumental_path, instrumental_wav, "audio/wav")
                    payload["instrumental_storage_path"] = instrumental_path
                else:
                    payload["instrumental_storage_path"] = None
                patch("exercise_analysis_jobs", job_id, payload)
                return

            vocal_path = job.get("vocal_storage_path")
            if not vocal_path:
                raise RuntimeError("Separated vocal path is missing")
            vocal_wav = root / "vocals.wav"
            download("exercise-analysis", vocal_path, vocal_wav)
            phrases = select(
                "exercise_phrases"
                f"?exercise_id=eq.{job['exercise_id']}&select=*&order=sort_order.asc,created_at.asc&limit=500"
            )
            if not phrases:
                raise RuntimeError("No phrases were approved")
            ready = 0
            for index, phrase in enumerate(phrases):
                try:
                    features = extract_features(
                        str(vocal_wav),
                        offset=float(phrase["start_sec"]),
                        duration=float(phrase["end_sec"]) - float(phrase["start_sec"]),
                        yin_fill=False,
                    )
                    rest(
                        "POST",
                        "/rest/v1/exercise_phrase_features?on_conflict=phrase_id",
                        json={
                            "phrase_id": phrase["id"],
                            "analyzer_version": ANALYZER_VERSION,
                            "features": features,
                        },
                        headers={
                            "content-type": "application/json",
                            "Prefer": "resolution=merge-duplicates,return=minimal",
                        },
                    )
                    clip_wav = root / f"phrase-{phrase['id']}.wav"
                    slice_wav(
                        vocal_wav,
                        clip_wav,
                        float(phrase["start_sec"]),
                        max(0.2, float(phrase["end_sec"]) - float(phrase["start_sec"])),
                    )
                    clip_dir = "/".join(str(vocal_path).replace("\\", "/").split("/")[:-1])
                    clip_path = f"{clip_dir}/phrases/{phrase['id']}.wav"
                    upload("exercise-analysis", clip_path, clip_wav, "audio/wav")
                    patch(
                        "exercise_phrases",
                        phrase["id"],
                        {
                            "feature_status": "ready",
                            "vocal_clip_storage_path": clip_path,
                        },
                    )
                    ready += 1
                except Exception:
                    log.exception("phrase %s extract failed", phrase.get("id"))
                    patch("exercise_phrases", phrase["id"], {"feature_status": "failed"})
                patch(
                    "exercise_analysis_jobs",
                    job_id,
                    {"progress": 72 + round(27 * (index + 1) / len(phrases))},
                )
            if ready == 0:
                raise RuntimeError("No phrases could be extracted")
            patch(
                "exercise_analysis_jobs",
                job_id,
                {
                    "status": "ready",
                    "progress": 100,
                    "error": None,
                    "locked_at": None,
                    "analyzer_version": ANALYZER_VERSION,
                },
            )
    except Exception as error:
        log.exception("analysis job %s failed", job_id)
        patch(
            "exercise_analysis_jobs",
            job_id,
            {"status": "failed", "error": public_error(error), "locked_at": None},
        )


def share_attempt(attempt: dict[str, Any]) -> None:
    attempt_id = attempt["id"]
    rows = select(
        "exercise_phrases"
        f"?id=eq.{attempt['phrase_id']}&select=id,title,exercise_id,start_sec,end_sec"
    )
    phrase = rows[0]
    exercises = select(f"exercises?id=eq.{phrase['exercise_id']}&select=id,title")
    exercise_title = exercises[0]["title"] if exercises else "Упражнение"
    profiles = select(f"profiles?id=eq.{attempt['student_id']}&select=full_name")
    sender_name = (profiles[0].get("full_name") if profiles else None) or "Ученик"
    source_path = attempt.get("storage_path")
    if not source_path:
        raise RuntimeError("Attempt audio was already removed")
    extension = mimetypes.guess_extension(attempt["media_mime"]) or ".wav"
    chat_path = f"{attempt['student_id']}/vocal-exercise-{attempt_id}{extension}"
    with tempfile.TemporaryDirectory(prefix="uvs-share-") as temp:
        source = Path(temp) / f"attempt{extension}"
        download("vocal-attempts", source_path, source)
        upload("chat-media", chat_path, source, attempt["media_mime"])
    phrase_title = phrase["title"] or f"{float(phrase['start_sec']):.1f}–{float(phrase['end_sec']):.1f} сек"
    message = f"UVS_EXERCISE_VOICE {exercise_title} · {phrase_title}"
    inserted = rest(
        "POST",
        "/rest/v1/chat_messages",
        json={
            "student_id": attempt["student_id"],
            "sender_id": attempt["student_id"],
            "sender_name": sender_name,
            "message": message,
            "message_type": "voice",
            "media_path": chat_path,
            "media_mime": attempt["media_mime"],
            "media_duration_sec": round(float(attempt["duration_sec"])),
        },
        headers={"content-type": "application/json", "Prefer": "return=representation"},
    ).json()[0]
    remove("vocal-attempts", source_path)
    patch(
        "vocal_exercise_attempts",
        attempt_id,
        {
            "status": "shared",
            "chat_message_id": inserted["id"],
            "storage_path": None,
            "locked_at": None,
            "expires_at": "infinity",
        },
    )


def process_attempt(attempt: dict[str, Any]) -> None:
    attempt_id = attempt["id"]
    try:
        if attempt["status"] == "evaluated" and attempt.get("share_requested"):
            share_attempt(attempt)
            return
        feature_rows = select(
            "exercise_phrase_features"
            f"?phrase_id=eq.{attempt['phrase_id']}&select=features,analyzer_version"
        )
        if not feature_rows:
            raise RuntimeError("Reference features are not ready")
        with tempfile.TemporaryDirectory(prefix="uvs-attempt-") as temp:
            source = Path(temp) / "attempt"
            wav = Path(temp) / "attempt.wav"
            download("vocal-attempts", attempt["storage_path"], source)
            to_wav(source, wav)
            student = extract_features(str(wav))
        anchors = select(
            "exercise_phrase_anchors"
            f"?phrase_id=eq.{attempt['phrase_id']}&feature_status=eq.ready"
            "&select=band,features"
        )
        anchor_map = {
            row["band"]: row["features"]
            for row in anchors
            if row.get("band") in {"high", "mid", "low"} and row.get("features")
        }
        result = score_with_anchors(
            feature_rows[0]["features"],
            student,
            anchor_map,
            int(attempt.get("global_shift_semitones") or 0),
        )
        if not result["evaluable"]:
            patch(
                "vocal_exercise_attempts",
                attempt_id,
                {
                    "status": "rejected",
                    "feedback": result["reason"],
                    "confidence": result["confidence"],
                    "evaluated_at": utc_now().isoformat(),
                    "locked_at": None,
                },
            )
            return
        patch(
            "vocal_exercise_attempts",
            attempt_id,
            {
                "status": "evaluated",
                "overall_score": result["overall"],
                "intonation_score": result["intonation"],
                "rhythm_score": result["rhythm"],
                "completeness_score": result["completeness"],
                "global_shift_semitones": result["global_shift_semitones"],
                "feedback": result["feedback"],
                "confidence": result["confidence"],
                "analyzer_version": ANALYZER_VERSION,
                "evaluated_at": utc_now().isoformat(),
                "expires_at": (utc_now() + timedelta(hours=1)).isoformat(),
                "locked_at": None,
            },
        )
    except Exception as error:
        log.exception("attempt %s failed", attempt_id)
        if attempt["status"] == "evaluated":
            patch(
                "vocal_exercise_attempts",
                attempt_id,
                {
                    "status": "evaluated",
                    "share_requested": False,
                    "error": public_error(error),
                    "locked_at": None,
                },
            )
            return
        patch(
            "vocal_exercise_attempts",
            attempt_id,
            {"status": "failed", "error": public_error(error), "locked_at": None},
        )


def process_anchor(row: dict[str, Any]) -> None:
    anchor_id = row["id"]
    try:
        storage_path = row.get("storage_path")
        if not storage_path:
            raise RuntimeError("Anchor audio path is missing")
        with tempfile.TemporaryDirectory(prefix="uvs-anchor-") as temp:
            source = Path(temp) / "anchor"
            wav = Path(temp) / "anchor.wav"
            download("exercise-analysis", storage_path, source)
            to_wav(source, wav)
            features = extract_features(str(wav))
        patch(
            "exercise_phrase_anchors",
            anchor_id,
            {
                "feature_status": "ready",
                "features": features,
                "analyzer_version": ANALYZER_VERSION,
                "error": None,
                "locked_at": None,
            },
        )
    except Exception as error:
        log.exception("anchor %s failed", anchor_id)
        patch(
            "exercise_phrase_anchors",
            anchor_id,
            {
                "feature_status": "failed",
                "error": public_error(error),
                "locked_at": None,
            },
        )


def cleanup_expired() -> None:
    rows = select(
        "vocal_exercise_attempts"
        "?select=id,storage_path&expires_at=lt.now()"
        "&status=in.(evaluated,rejected,failed)&share_requested=eq.false&limit=20"
    )
    for row in rows:
        try:
            if row.get("storage_path"):
                remove("vocal-attempts", row["storage_path"])
            patch(
                "vocal_exercise_attempts",
                row["id"],
                {"status": "discarded", "storage_path": None, "locked_at": None},
            )
        except Exception:
            log.exception("cleanup failed for %s", row["id"])


def main() -> None:
    from smoke_test import main as run_smoke

    run_smoke()
    log.info("worker started analyzer=%s demucs=%s", ANALYZER_VERSION, DEMUCS_SPACE)
    last_cleanup = 0.0
    while True:
        worked = False
        analysis = rpc("claim_exercise_analysis_job")
        if analysis:
            process_analysis(analysis)
            worked = True
        attempt = rpc("claim_vocal_exercise_attempt")
        if attempt:
            process_attempt(attempt)
            worked = True
        anchor = rpc("claim_exercise_phrase_anchor")
        if anchor:
            process_anchor(anchor)
            worked = True
        if time.time() - last_cleanup > 300:
            cleanup_expired()
            last_cleanup = time.time()
        if not worked:
            time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
