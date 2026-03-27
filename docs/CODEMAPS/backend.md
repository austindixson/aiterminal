# Backend Codemap

**Last Updated:** 2026-03-25
**Area:** Electron Main Process
**Total Files:** 13
**Total Lines:** ~2,470

## Entry Points
- `src/main/main.ts` (226 lines) - Electron main process entry point
- `src/main/index.ts` (23 lines) - Main process public API
- `src/main/preload.ts` (213 lines) - Context bridge preload script

## Architecture
```
src/main/
├── main.ts                       # Electron app lifecycle, window creation
├── preload.ts                    # Context bridge (window.electronAPI)
├── index.ts                      # Public API barrel export
├── ipc-handlers.ts               # IPC channel handlers (566 lines)
├── terminal-session-manager.ts   # Multi-session PTY management (220 lines)
├── workspace-policy.ts           # File operation security rules (123 lines)
├── daemon-bridge.ts              # Gateway daemon IPC (129 lines)
├── lossless-bridge.ts            # Lossless Recall integration (54 lines)
├── ecosystem-exec.ts             # Ecosystem command execution (116 lines)
├── kokoro-service.ts             # TTS service sidecar (219 lines)
├── cwd-probe.ts                  # Working directory detection (37 lines)
├── ipc-handlers.test.ts          # IPC handler tests
└── workspace-policy.test.ts      # Policy validation tests
```

## Key Modules

| File | Lines | Purpose |
|------|-------|---------|
| `main.ts` | 226 | Electron app initialization, window creation, AI client setup, daemon bridge |
| `preload.ts` | 213 | Secure context bridge for IPC, session data buffering, typed API |
| `ipc-handlers.ts` | 566 | All IPC channel handlers (AI, PTY, file, theme, ecosystem) |
| `terminal-session-manager.ts` | 220 | Multi-session PTY lifecycle, create/destroy/write/resize |
| `workspace-policy.ts` | 123 | File path allowlist, size limits, security validation |
| `daemon-bridge.ts` | 129 | Communication with gateway daemon (TCP + auth) |
| `lossless-bridge.ts` | 54 | Chat history persistence via lossless-recall |
| `ecosystem-exec.ts` | 116 | Execute external ecosystem tools (dietmcp, ferroclaw, skinnytools) |
| `kokoro-service.ts` | 219 | Text-to-speech service wrapper (Python sidecar) |
| `cwd-probe.ts` | 37 | Resolve shell CWD from PID (macOS/Linux) |

## Data Flow

### IPC Communication
```
Renderer → window.electronAPI.xxx() → preload
         → ipcRenderer.invoke() → main process
         → ipcMain.handle() → handler function
         → returns back through chain
```

### PTY Session Lifecycle
```
1. createPtyBridge() → new node-pty instance
2. sessionId generated → stored in manager
3. Data events → session-data IPC to renderer
4. Cleanup → dispose() removes from manager
```

### AI Query Flow
```
1. Renderer → ai-query-stream IPC
2. Handler → OpenRouterClient.streamQuery()
3. Chunks → ai-stream-chunk IPC back to renderer
4. Renderer → streaming UI update
```

### Session Data Buffering
```
1. PTY emits data before xterm.js mounts
2. Preload buffers data in sessionBuffers Map
3. Renderer subscribes via onSessionData()
4. Buffer flushed to callback on subscription
```

## Security Architecture

### Context Isolation
- **Context isolation:** ENABLED
- **Node integration:** DISABLED
- All APIs via `contextBridge` in preload
- No remote module usage
- No `eval()` or dynamic code execution

### File Operations
- All file reads/writes validated by `workspace-policy.ts`
- Allowlist-based path validation (`AITERMINAL_WORKSPACE_ROOTS`)
- Size limits prevent memory exhaustion (`AITERMINAL_MAX_FILE_BYTES`, default 10MiB)
- Path normalization prevents directory traversal

### IPC Boundaries
- All channels explicitly registered in `setupAllHandlers()`
- Session-scoped PTY operations prevent cross-session interference
- Daemon bridge authenticated via token file
- Ecosystem command execution sanitized (no shell metacharacters)

## Module Details

### main.ts - Application Entry Point
**Key Responsibilities:**
- Environment configuration (.env + superenv)
- BrowserWindow creation with security settings
- AI client initialization (OpenRouter)
- TerminalSessionManager lifecycle
- Daemon bridge connection
- IPC handler registration
- macOS activate handling (window recreation)

**Critical Functions:**
- `createWindow()` - Creates Electron window with proper webPreferences
- `createAIClient()` - Initializes OpenRouter client or stub
- `createStubAIClient()` - Returns error responses when API key missing

### preload.ts - Context Bridge
**Key Responsibilities:**
- Exposes typed `ElectronAPI` to renderer
- Buffers PTY data per session before renderer subscription
- Implements streaming AI query with correlation ID
- Handles daemon event subscriptions
- Legacy PTY bridge compatibility

**Critical Types:**
- `SessionBuffer` - Per-session data buffer and callback
- `ElectronAPI` - Complete IPC interface (see types/index.ts)

**Key Pattern:**
```typescript
onSessionData(sessionId, callback) {
  // Flush buffered data, set callback, return unsubscribe
}
```

### ipc-handlers.ts - IPC Channel Registry
**Key Responsibilities:**
- Factory functions for handler creation
- PTY bridge implementation (bidirectional)
- AI query/stream handling with cancellation
- Theme management (immutable ThemeManager)
- Session-scoped file operations
- Ecosystem integration (lossless, dietmcp, ferroclaw, kokoro)

**Handler Categories:**
1. **AI** - `ai-query`, `ai-query-stream`, `get-active-ai-model`, `ai-query-stream-cancel`
2. **Theme** - `get-themes`, `set-theme`, `get-theme-config`
3. **Session** - `create-terminal-session`, `destroy-terminal-session`, `write-to-session`, `resize-session`, `get-session-cwd`
4. **File** - `read-directory`, `read-directory-tree`, `read-file`, `write-file`, `delete-file`
5. **Ecosystem** - `lossless-sync`, `dietmcp-exec`, `skinnytools-wrap`, `ferroclaw-exec`, `kokoro-tts-*`

**Critical Functions:**
- `createPtyBridge()` - Bridges PTY to BrowserWindow with sessionId
- `createAIQueryHandler()` - Graceful error handling for AI failures
- `createThemeHandlers()` - Immutable theme state management
- `createCommandHandler()` - Legacy command execution via PTY

### terminal-session-manager.ts - PTY Lifecycle
**Key Responsibilities:**
- Manages multiple node-pty instances
- Session creation/destruction with notification
- Write/resize routing to correct PTY
- CWD tracking and updates
- Cleanup on app shutdown

**Session Interface:**
```typescript
interface TerminalSession {
  sessionId: string;        // UUID
  pty: IPty;               // node-pty instance
  ptyBridge: PtyBridge;    // Bridge to renderer
  shell: string;           // /bin/zsh, etc.
  cwd: string;             // Current directory
  createdAt: number;       // Timestamp
}
```

**Key Methods:**
- `createSession(options)` - Spawn PTY, create bridge, notify renderer
- `destroySession(sessionId)` - Kill PTY, cleanup, notify renderer
- `writeToSession(sessionId, data)` - Route input to correct PTY
- `resizeSession(sessionId, cols, rows)` - Resize PTY
- `updateSessionCwd(sessionId, cwd)` - Track directory changes

### workspace-policy.ts - Security Policy
**Key Responsibilities:**
- Path allowlist validation
- File size limits
- Directory traversal prevention
- Tilde expansion support

**Environment Variables:**
- `AITERMINAL_WORKSPACE_ROOTS` - Comma-separated allowed paths
- `AITERMINAL_MAX_FILE_BYTES` - Max read/write size (default 10MiB)

**Key Functions:**
- `getWorkspaceRoots()` - Returns allowed roots (or defaults to cwd + home)
- `isPathWithinWorkspace(path)` - Checks if path is under allowed root
- `validateWorkspacePath(path, options)` - Returns {allowed, error?}

### daemon-bridge.ts - Gateway Daemon Client
**Key Responsibilities:**
- TCP connection to gateway daemon (port 47821)
- Token-based authentication
- Message queuing before auth
- Goal submission and approval

**Protocol:**
- JSON-over-TCP with newline delimiters
- Auth flow: `{type: "auth", token}` → `{type: "auth_ok"}`
- Events forwarded to renderer via `daemon-event` IPC

**Key Methods:**
- `connect()` - Establish TCP connection, authenticate
- `submitGoal(goal)` - Send goal to daemon
- `approve(jobId, stepId, approved)` - Approve daemon step

### lossless-bridge.ts - Chat Persistence
**Key Responsibilities:**
- Pipe chat messages to lossless-recall SQLite store
- Spawn lossless capture script via Node.js
- JSON payload delivery via stdin

**Environment:**
- `AITERMINAL_LOSSLESS_ROOT` - Path to lossless-claude repo

**Interface:**
```typescript
function runLosslessCapture(
  sessionId: string,
  conversation: LosslessChatMessage[]
): Promise<{ok: boolean; error?: string}>
```

### ecosystem-exec.ts - External Tool Execution
**Key Responsibilities:**
- Sandbox execution of dietmcp, skinnytools, ferroclaw
- Input validation and sanitization
- Timeout protection (120s default)
- Output size limits (512KiB)

**Security Measures:**
- No shell metacharacters allowed (;&|`$(){})
- Valid JSON required for args
- Command length limits
- `shell: false` in spawnSync

**Functions:**
- `execDietMcp(server, tool, argsJson)` - MCP tool execution
- `execSkinnytoolsWrap(command)` - Compress tool output
- `execFerroclaw(goal)` - Rust agent execution

### kokoro-service.ts - TTS Sidecar
**Key Responsibilities:**
- Manage Python TTS subprocess
- JSON-over-stdio protocol
- Lazy initialization on first use
- Process lifecycle and error recovery

**Environment:**
- `AITERMINAL_KOKORO=1` - Enable service
- `AITERMINAL_KOKORO_SCRIPT` - Custom script path
- `AITERMINAL_KOKORO_PYTHON` - Python binary (default: python3)

**Protocol:**
```
→ {"text": "hello world"}
← {"ok": true, "mimeType": "audio/wav", "dataBase64": "..."}
```

**Key Methods:**
- `getStatus()` - Returns {configured, scriptPath, ready, lastError}
- `speak(text)` - Generate speech from text
- `dispose()` - Cleanup subprocess

### cwd-probe.ts - Working Directory Detection
**Key Responsibilities:**
- Resolve actual CWD from PTY process PID
- Platform-specific implementations (macOS: lsof, Linux: /proc)
- Used to sync session cwd when user runs `cd`

**Function:**
```typescript
function resolveCwdFromPid(pid: number): string | null
```

## External Dependencies
- **electron** - Desktop framework
- **node-pty** - PTY spawning (xterm.js compatible)
- **electron-is-dev** - Development detection

## IPC Channel Reference

### AI Queries
- `ai-query` - Single-shot AI query
- `ai-query-stream` - Streaming AI response (with requestId)
- `ai-query-stream-cancel` - Cancel in-flight stream
- `get-active-ai-model` - Get current model info

### Terminal Sessions
- `create-terminal-session` - Spawn new PTY session
- `destroy-terminal-session` - Kill PTY session
- `write-to-session` - Send input to PTY
- `resize-session` - Resize PTY terminal
- `get-session-cwd` - Get working directory

### File Operations
- `read-directory` - List directory contents (shallow)
- `read-directory-tree` - Recursive tree with depth limit
- `read-file` - Read file content (size-limited)
- `write-file` - Write file (policy-checked)
- `delete-file` - Delete file (policy-checked)

### Theme Management
- `get-themes` - List available themes
- `set-theme` - Set active theme
- `get-theme-config` - Get theme config JSON

### Ecosystem Integrations
- `lossless-sync` - Persist chat to SQLite
- `dietmcp-exec` - Execute MCP tool
- `skinnytools-wrap` - Compress tool output
- `ferroclaw-exec` - Execute Rust agent
- `kokoro-tts-status` - Check TTS service
- `kokoro-tts-speak` - Generate speech

### Daemon (Gateway)
- `daemon-submit-goal` - Submit goal to daemon
- `daemon-approve` - Approve daemon step
- `daemon-reconnect` - Reconnect to daemon
- `daemon-event` - Daemon → renderer events

## Related Areas
- [frontend.md](frontend.md) - Renderer process (React, xterm.js)
- [integrations.md](integrations.md) - Daemon bridges and ecosystem tools
- [shared-utilities.md](shared-utilities.md) - AI client, shell service, file tree
