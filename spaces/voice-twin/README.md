---
title: Unique Vocal Studio Voice Twin
emoji: 🎤
colorFrom: pink
colorTo: indigo
sdk: gradio
sdk_version: 4.44.0
app_file: app.py
pinned: false
---

# Neural Voice Twin (Resemblyzer + VoxCeleb1)

Deploy this folder as a **Hugging Face Space**, then set in the PWA:

```
VOICE_MATCH_HF_SPACE=your-user/unique-vocal-voice-twin
HUGGINGFACE_API_KEY=hf_...
```

## Extra stars (Shakira, Russian, K-pop…)

VoxCeleb1 does **not** include every singer (e.g. Shakira). Add short clean vocal WAVs:

```
extra_refs/Shakira.wav
extra_refs/Zemfira.wav
extra_refs/Oxxxymiron.wav
```

They are embedded with the **same** Resemblyzer model at Space startup and join the search bank.

Use 5–15 s of dry vocal (no loud beat), mono 16 kHz preferred.
