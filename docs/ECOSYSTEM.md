# AITerminal local ecosystem

AITerminal can interoperate with tools you already use. Everything is **opt-in** via environment variables (see `.env.example`).

| Project | Role in AITerminal |
|--------|---------------------|
| **[lossless-claude](https://github.com/RuneweaverStudios/lossless-claude)** | Set `AITERMINAL_LOSSLESS_ROOT` to your built repo. Chat messages are piped to `dist/capture.js` (same delta format as the Claude Code Stop hook) so recall stays in one SQLite store. Run the MCP server (`dist/server.js`) alongside Cursor/Claude Code to search history with `recall_*` tools. |
| **[dietmcp](https://github.com/RuneweaverStudios/dietmcp)** | MCP→CLI bridge. Renderer/main can call `window.electronAPI.dietmcpExec({ server, tool, argsJson })` which runs `dietmcp exec …` in the main process (no shell). Use in automations or future agent steps. Default binary: `dietmcp` or set `AITERMINAL_DIETMCP_BIN`. |
| **ferroclaw** (Rust agent, local clone e.g. `~/Desktop/ferroclaw`) | Optional: `AITERMINAL_FERROCLAW_BIN` + `window.electronAPI.ferroclawExec(goal)` runs `ferroclaw exec "<goal>"`. Keep the binary path explicit; this is powerful. |
| **skinnytools** | Large CLI output compression. `window.electronAPI.skinnytoolsWrap(command)` runs `skinnytools wrap` (or `python3 -m skinnytools wrap` via `AITERMINAL_SKINNYTOOLS_*`). Commands are restricted (no `;`, pipes, subshells). |
| **superenv** | Extra secrets file: set `AITERMINAL_SUPERENV_FILE` to a path; it is merged with `dotenv` **after** the project `.env` (does not override keys already set). |
| **[Kokoro-82M](https://github.com/hexgrad/kokoro)** (optional TTS) | Set `AITERMINAL_KOKORO=1`. On macOS: `brew install espeak-ng`. Use a **project venv** (e.g. `python3 -m venv .venv-kokoro` then `pip install -r scripts/requirements-kokoro.txt`) so PEP 668 does not block installs; point `AITERMINAL_KOKORO_PYTHON` at `.venv-kokoro/bin/python3`. The requirements file pins **en_core_web_sm** for misaki/spaCy (avoid `python -m spacy download` if `uv` on your PATH errors). The main process spawns `scripts/kokoro-tts-stdio.py`; `useVoiceIO`’s `speak()` tries IPC (`kokoroTtsSpeak`) first, then browser `speechSynthesis`. Override script via `AITERMINAL_KOKORO_SCRIPT`, voice via `AITERMINAL_KOKORO_VOICE`, language via `AITERMINAL_KOKORO_LANG`. Status: `window.electronAPI.kokoroTtsStatus()`. |

## Gateway daemon

The Node gateway in `daemon/` is separate from dietmcp/ferroclaw; you can still point agents at **OpenRouter** from `.env` and use **dietmcp** from the shell inside the PTY (`dietmcp exec …`) the same way you would in a normal terminal.

## Building lossless-claude

```bash
cd /path/to/lossless-claude && npm install && npm run build
```

Then set `AITERMINAL_LOSSLESS_ROOT` to that directory and restart AITerminal.
