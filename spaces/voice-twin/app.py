"""
Neural celebrity voice twin — Resemblyzer + VoxCeleb1 embeddings.
Deploy as a Hugging Face Space, then set VOICE_MATCH_HF_SPACE in the PWA.

Extra artist refs (Shakira, Russian stars, K-pop…): put short mono WAV clips
into ./extra_refs/<Artist_Name>.wav — embedded at startup into the same bank.
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

import gradio as gr
import numpy as np
import requests
from resemblyzer import VoiceEncoder, preprocess_wav

ROOT = Path(__file__).resolve().parent
EXTRA_DIR = ROOT / "extra_refs"
CACHE = ROOT / ".cache"
DATA_URLS = {
    "embeds": "https://raw.githubusercontent.com/smorantg2/voice_comparison/master/embeded_voices.npy",
    "ids": "https://raw.githubusercontent.com/smorantg2/voice_comparison/master/ids_voices.npy",
    "names": "https://raw.githubusercontent.com/smorantg2/voice_comparison/master/ids_names.csv",
}

encoder: VoiceEncoder | None = None
bank_names: list[str] = []
bank_embeds: np.ndarray | None = None


def _download(url: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 1000:
        return dest
    r = requests.get(url, timeout=180)
    r.raise_for_status()
    dest.write_bytes(r.content)
    return dest


def _l2_normalize(x: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(x, axis=-1, keepdims=True)
    n = np.maximum(n, 1e-9)
    return x / n


def _pretty(name: str) -> str:
    return name.replace("_", " ").strip()


def load_bank() -> None:
    global encoder, bank_names, bank_embeds

    embeds_path = _download(DATA_URLS["embeds"], CACHE / "embeded_voices.npy")
    ids_path = _download(DATA_URLS["ids"], CACHE / "ids_voices.npy")
    names_path = _download(DATA_URLS["names"], CACHE / "ids_names.csv")

    embeds = np.load(str(embeds_path)).astype(np.float32)
    ids = np.load(str(ids_path), allow_pickle=True)

    id_to_name: dict[str, str] = {}
    for line in names_path.read_text(encoding="utf-8").splitlines()[1:]:
        parts = line.strip().split(",")
        if len(parts) >= 3:
            id_to_name[str(parts[1]).strip()] = parts[2].strip()

    names: list[str] = []
    rows: list[np.ndarray] = []
    for i in range(len(embeds)):
        cid = str(ids[i])
        nm = id_to_name.get(cid)
        if nm is None:
            # numpy may store without id prefix quirks
            nm = id_to_name.get(cid.replace("b'", "").replace("'", ""))
        if nm is None:
            continue
        names.append(_pretty(nm))
        rows.append(embeds[i])

    EXTRA_DIR.mkdir(exist_ok=True)
    encoder = VoiceEncoder()
    for wav_path in sorted(EXTRA_DIR.glob("*.wav")):
        try:
            wav = preprocess_wav(str(wav_path))
            emb = encoder.embed_utterance(wav)
            names.append(_pretty(wav_path.stem))
            rows.append(np.asarray(emb, dtype=np.float32))
            print(f"[voice-twin] extra ref: {wav_path.stem}")
        except Exception as exc:  # noqa: BLE001
            print(f"[voice-twin] skip {wav_path.name}: {exc}")

    if not rows:
        raise RuntimeError("Empty voice bank")

    mat = _l2_normalize(np.stack(rows, axis=0))
    bank_names = names
    bank_embeds = mat
    print(f"[voice-twin] bank size={len(bank_names)} dim={mat.shape[1]}")


def match_voice(audio, top_n: float = 80) -> str:
    global encoder, bank_names, bank_embeds
    if bank_embeds is None or encoder is None:
        load_bank()
    assert bank_embeds is not None and encoder is not None

    if audio is None:
        return json.dumps({"error": "no_audio", "matches": []})

    path = audio
    if isinstance(audio, (tuple, list)) and len(audio) == 2:
        sr, data = audio
        import soundfile as sf

        tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        arr = np.asarray(data)
        if arr.ndim > 1:
            arr = arr.mean(axis=1)
        arr = arr.astype(np.float32)
        peak = float(np.max(np.abs(arr))) + 1e-9
        arr = arr / peak
        sf.write(tmp.name, arr, int(sr))
        path = tmp.name

    try:
        wav = preprocess_wav(path)
        emb = _l2_normalize(
            np.asarray(encoder.embed_utterance(wav), dtype=np.float32).reshape(-1)
        )
        sims = bank_embeds @ emb
        n = int(max(5, min(200, float(top_n or 80))))
        order = np.argsort(-sims)[:n]
        matches = [
            {"name": bank_names[int(i)], "score": float(sims[int(i)])}
            for i in order
        ]
        return json.dumps(
            {"engine": "resemblyzer+voxceleb1+extra_refs", "matches": matches}
        )
    except Exception as exc:  # noqa: BLE001
        return json.dumps({"error": str(exc), "matches": []})


try:
    load_bank()
except Exception as exc:  # noqa: BLE001
    print(f"[voice-twin] deferred load: {exc}")


demo = gr.Interface(
    fn=match_voice,
    inputs=[
        gr.Audio(type="filepath", label="Voice clip"),
        gr.Number(value=80, label="Top N", precision=0),
    ],
    outputs=gr.Textbox(label="JSON matches"),
    title="Unique Vocal Studio — Neural Voice Twin",
    description="Resemblyzer vs VoxCeleb1 + extra_refs/*.wav",
    api_name="match",
)

if __name__ == "__main__":
    demo.queue().launch(
        server_name="0.0.0.0",
        server_port=int(os.environ.get("PORT", 7860)),
    )
