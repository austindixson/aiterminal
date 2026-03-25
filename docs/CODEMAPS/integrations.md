# Integrations Codemap

**Last Updated:** 2026-03-24
**Area:** Ecosystem Bridges
**Total Files:** 5 core files
**Total Lines:** ~177

## Entry Points
- `src/integrations/ecosystem.ts` - Ecosystem tool bridge registry (58 lines)
- `src/main/ecosystem-exec.ts` - Ecosystem command execution bridge (96 lines)

## Architecture
```
src/
├── integrations/
│   └── ecosystem.ts              # Integration registry (env vars, paths)
└── main/
    ├── ecosystem-exec.ts         # Process spawning for ecosystem tools
    ├── lossless-bridge.ts        # Lossless recall chat history
    ├── kokoro-service.ts         # TTS service integration
    └── daemon-bridge.ts          # Daemon/gateway communication
```

## Key Modules

| File | Purpose | Lines |
|------|---------|-------|
| `ecosystem.ts` | Registry for ecosystem integrations (env vars, binary paths) | 58 |
| `ecosystem-exec.ts` | Spawns subprocesses for external tools with stdout/stderr streaming | 96 |
| `lossless-bridge.ts` | Chat history persistence via lossless-claude | 41 |
| `kokoro-service.ts` | Text-to-speech service sidecar | 176 |
| `daemon-bridge.ts` | Gateway daemon communication bridge | 117 |

## Supported Integrations

All integrations are **opt-in** via environment variables:

| Integration | Purpose | Env Variable | Default |
|-------------|---------|--------------|---------|
| **lossless-recall** | Chat history persistence | `AITERMINAL_LOSSLESS_ROOT` or `LOSSLESS_RECALL_ROOT` | (none) |
| **dietmcp** | MCP → CLI bridge | `AITERMINAL_DIETMCP_BIN` | `dietmcp` (PATH) |
| **ferroclaw** | Local Rust agent | `AITERMINAL_FERROCLAW_BIN` | (none) |
| **skinnytools** | Context compression wrap | `AITERMINAL_SKINNYTOOLS_BIN` or `AITERMINAL_SKINNYTOOLS_PYTHON` | `python3 -m skinnytools` |
| **superenv** | Additional secrets file | `AITERMINAL_SUPERENV_FILE` or `SUPERENV_FILE` | (none) |
| **kokoro** | Text-to-speech | `AITERMINAL_KOKORO` | (flag-based) |

## Data Flow

**Ecosystem Command Execution:**
1. User invokes ecosystem tool (e.g., via `ecosystem-exec.ts`)
2. Validates env vars via `ecosystem.ts` getters
3. Spawns subprocess with configured binary
4. Streams stdout/stderr back to terminal
5. Returns exit code

**Lossless Recall Flow:**
1. Chat message sent → `lossless-bridge.ts`
2. Captures to local SQLite via lossless-claude's `dist/capture.js`
3. Query by message ID for retrieval
4. Returns full conversation context

**Kokoro TTS Flow:**
1. User enables voice → `kokoro-service.ts`
2. Sends text to Kokoro sidecar process
3. Receives audio stream
4. Plays through system audio

**Daemon Bridge Flow:**
1. Gateway daemon spawns for background services
2. IPC communication via `daemon-bridge.ts`
3. Manages daemon lifecycle (start/stop/restart)
4. Handles daemon stdout/stderr streams

## Core Functions

**ecosystem.ts**
- `getDietmcpBin()` - Returns dietmcp binary path
- `getLosslessRoot()` - Returns lossless-claude repo root
- `getLosslessCaptureScript()` - Path to capture.js
- `getFerroclawBin()` - Returns ferroclaw binary path
- `buildSkinnytoolsWrapArgs()` - Constructs skinnytools wrap command
- `getSuperenvPath()` - Returns superenv secrets file path

**ecosystem-exec.ts**
- `execEcosystemTool()` - Spawns subprocess with streaming
- Handles stdout/stderr/event forwarding to renderer
- Process cleanup on disposal

**lossless-bridge.ts**
- `runLosslessCapture()` - Captures chat messages to SQLite
- `queryLosslessContext()` - Retrieves conversation history

**kokoro-service.ts**
- `KokoroService` class - Manages TTS sidecar process
- `speak()` - Queues text for audio playback
- `stop()` - Cancels current playback

**daemon-bridge.ts**
- `startDaemon()` - Spawns gateway daemon process
- `stopDaemon()` - Terminates daemon
- `getDaemonStatus()` - Returns process state

## External Dependencies
- **lossless-claude** (optional) - Chat history storage
- **dietmcp** (optional) - MCP CLI bridge
- **ferroclaw** (optional) - Rust agent runtime
- **skinnytools** (optional) - Context compression
- **kokoro** (optional) - TTS engine
- **gateway daemon** (optional) - Background service manager

## Configuration

All integrations configured via `.env` file:
```bash
# Optional: Lossless Recall (chat history)
AITERMINAL_LOSSLESS_ROOT=/path/to/lossless-claude

# Optional: DietMCP bridge
AITERMINAL_DIETMCP_BIN=/path/to/dietmcp

# Optional: Ferroclaw agent
AITERMINAL_FERROCLAW_BIN=/path/to/ferroclaw

# Optional: Skinnytools
AITERMINAL_SKINNYTOOLS_BIN=/path/to/skinnytools
# OR
AITERMINAL_SKINNYTOOLS_PYTHON=python3
AITERMINAL_SKINNYTOOLS_MODULE=skinnytools

# Optional: Kokoro TTS
AITERMINAL_KOKORO=1

# Optional: Superenv secrets
AITERMINAL_SUPERENV_FILE=/path/to/secrets.env
```

## Integration Lifecycle

All integrations follow a **lazy initialization** pattern:
1. Check env var at runtime (not startup)
2. Return empty/default if not configured
3. Spawn subprocess only when first invoked
4. Clean up processes on app exit

This ensures AITerminal works without any ecosystem tools present, adding features only when configured.

## Related Areas
- [backend.md](backend.md) - Main process integration points
- [shared-utilities.md](shared-utilities.md) - AI client integration
- [cli-frontend.md](cli-frontend.md) - Terminal I/O integration

## Documentation

See `docs/ECOSYSTEM.md` for full integration documentation and setup instructions.
