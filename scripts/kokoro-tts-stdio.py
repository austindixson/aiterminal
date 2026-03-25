#!/usr/bin/env python3
"""
Kokoro-82M TTS stdio sidecar for AITerminal.

Protocol (newline-delimited JSON):
  - On success after model load: {"ready": true}
  - On load failure: {"ready": false, "error": "..."} then exit 1
  - Request line: {"text": "..."}
  - Response: {"ok": true, "mimeType": "audio/wav", "dataBase64": "..."}
            or {"ok": false, "error": "..."}

Requires: pip install 'kokoro>=0.9.4' soundfile
macOS/Linux: espeak-ng for best English quality (see hexgrad/kokoro README).
"""

from __future__ import annotations

import base64
import contextlib
import io
import json
import os
import sys


def _emit(obj: object) -> None:
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def _main() -> None:
    lang = os.environ.get("AITERMINAL_KOKORO_LANG", "a")
    voice = os.environ.get("AITERMINAL_KOKORO_VOICE", "af_heart")
    try:
        import numpy as np
        import soundfile as sf
        from kokoro import KPipeline
    except ImportError as e:
        _emit({"ready": False, "error": f"import failed: {e}"})
        sys.exit(1)

    try:
        # Hugging Face / kokoro may print warnings to stdout; keep stdio JSON-only.
        _capture = io.StringIO()
        with contextlib.redirect_stdout(_capture):
            pipeline = KPipeline(lang_code=lang)
    except SystemExit as e:
        _emit({"ready": False, "error": f"kokoro init failed (exit {e.code}). Install en_core_web_sm in the same venv (see scripts/requirements-kokoro.txt)."})
        sys.exit(1)
    except Exception as e:  # noqa: BLE001 — surface to parent
        _emit({"ready": False, "error": str(e)})
        sys.exit(1)

    _emit({"ready": True})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as e:
            _emit({"ok": False, "error": f"invalid json: {e}"})
            continue

        text = (req.get("text") or "").strip()
        if not text:
            _emit({"ok": False, "error": "empty text"})
            continue

        if len(text) > 50_000:
            _emit({"ok": False, "error": "text too long"})
            continue

        try:
            generator = pipeline(text, voice=voice, speed=1.0)
            chunks: list = []
            for _gs, _ps, audio in generator:
                chunks.append(audio)
            if not chunks:
                _emit({"ok": False, "error": "no audio generated"})
                continue
            full = np.concatenate(chunks) if len(chunks) > 1 else chunks[0]
            buf = io.BytesIO()
            sf.write(buf, full, 24000, format="WAV", subtype="PCM_16")
            b64 = base64.b64encode(buf.getvalue()).decode("ascii")
            _emit({"ok": True, "mimeType": "audio/wav", "dataBase64": b64})
        except Exception as e:  # noqa: BLE001
            _emit({"ok": False, "error": str(e)})


if __name__ == "__main__":
    _main()
