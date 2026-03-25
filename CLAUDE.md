# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Build & Run
- `npm run dev` - Start development server (Vite at localhost:5173 + Electron)
- `npm run build` - Build TypeScript and Vite renderer bundle
- `npm run build:electron` - Build Electron app for distribution
- `npm run build:daemon` - Build the gateway daemon (optional)

### Testing
- `npm run test` - Run all tests (Vitest)
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Generate coverage report (target: 80%+)
- `npm run test:e2e` - Run Playwright end-to-end tests
- `npm run lint` - TypeScript type check only (`tsc --noEmit`)

### Individual Test Execution
- Run a single test file: `npx vitest run path/to/test.test.ts`
- Run tests matching a pattern: `npx vitest run --grep "test name"`

### Environment Setup
- Copy `.env.example` to `.env` and configure `OPENROUTER_API_KEY` for AI features
- See `.env.example` for optional ecosystem integrations (lossless-recall, dietmcp, ferroclaw, Kokoro TTS)

## Architecture Overview

### Project Structure
```
src/
├── main/           # Electron main process (Node.js context)
├── renderer/       # React UI (Vite dev server, contextIsolated)
├── ai/             # OpenRouter client, model presets, streaming
├── shell/          # Pure functions for NL/shell routing logic
├── themes/         # Theme definitions (5 built-in themes)
├── file-tree/      # Directory traversal, file entry types
├── integrations/   # Ecosystem bridges (superenv, lossless, dietmcp, ferroclaw)
├── types/          # Shared TypeScript types
└── test/           # Vitest setup, utilities
```

### Key Architectural Patterns

**Multi-Session PTY Management**: `TerminalSessionManager` (main process) manages multiple `node-pty` instances, each with a unique `sessionId`. The renderer maintains `useTerminalTabs` hook state. All IPC communication is session-scoped via `write-to-session`, `resize-session`, and `get-session-cwd`. PTY data events include `sessionId` so the renderer routes to the correct xterm.js instance.

**IPC Bridge Pattern**: `createPtyBridge()` returns a `{ writeToPty, resizePty, dispose }` interface for each session. Main→renderer communication uses `window.webContents.send('session-data', sessionId, data)`. This is how PTY output reaches the renderer without blocking.

**AI Query Routing**: The app uses OpenRouter with preset-based model routing. Task types (`command_help`, `error_analysis`, `code_explain`, `general`) map to models via `RouterPreset`. The `OpenRouterClient` implements `IAIClient` interface with graceful error handling (returns error `AIResponse` objects instead of throwing).

**Natural Language Detection**: `shell-service.ts` contains pure functions that determine whether input is natural language or a shell command. The heuristic checks for question starters, request phrases, action phrases, trailing question marks, and multi-word input. TUI mode (`Cmd+Shift+T`) disables NL interception for tools like Claude Code CLI.

**Theme System**: `ThemeManager` is immutable—`setTheme()` returns a new manager instance. Themes define 16 ANSI colors, background, foreground, cursor, and selection. The renderer applies themes via xterm.js `setOption()` and CSS custom properties for UI components.

**File Operations Policy**: `workspace-policy.ts` validates all file read/write paths against a configurable allowlist and size limits. Agent file writes use `write-file` IPC handler which enforces these policies.

**Lossless Recall Integration**: Chat messages can be persisted to a local SQLite store via `runLosslessCapture()`. This requires `AITERMINAL_LOSSLESS_ROOT` pointing to a built lossless-claude repo.

### Critical Data Flow

**Shell Input → AI Routing**:
1. User types in terminal → `TerminalView.onCommand()`
2. `isNaturalLanguage()` checks input patterns
3. If NL: inject into chat sidebar, prevent PTY write
4. If shell: write to PTY via `writeToSession()`

**PTY Output → Error Detection**:
1. PTY emits data → `createPtyBridge()` forwards via `session-data` IPC
2. Renderer checks for error patterns (command not found, permission denied, etc.)
3. Errors route to chat sidebar with context

**AI Streaming**:
1. Chat send → `ai-query-stream` IPC (main process)
2. `OpenRouterClient.streamQuery()` yields chunks
3. Main sends `ai-stream-chunk` events back to renderer
4. `StreamingText` component renders incrementally

### TypeScript Configuration

**Main Process**: `tsconfig.main.json` - CommonJS output, `isolatedModules`, strict mode
**Renderer**: Uses Vite with `@vitejs/plugin-react`, path alias `@/*` → `src/*`

### Electron Security

- Context isolation enabled, node integration disabled
- Preload script exposes `window.electronAPI` via `contextBridge`
- No `eval()` or remote module usage
- File operations gated by `workspace-policy.ts`

### Optional Ecosystem Integrations

All integrations are opt-in via environment variables:
- **lossless-recall**: `AITERMINAL_LOSSLESS_ROOT` - Chat history persistence
- **dietmcp**: `AITERMINAL_DIETMCP_BIN` - MCP→CLI bridge
- **ferroclaw**: `AITERMINAL_FERROCLAW_BIN` - Local Rust agent
- **Kokoro TTS**: `AITERMINAL_KOKORO=1` - Text-to-speech sidecar
- **superenv**: `AITERMINAL_SUPERENV_FILE` - Additional secrets file

See `docs/ECOSYSTEM.md` for full details.

### Test Structure

- Unit tests: `*.test.ts` alongside source files
- Component tests: `*.test.tsx` in `src/renderer/components/`
- Test utilities: `src/test/setup.ts` (jsdom environment, Vitest globals)
- Coverage goal: 80%+ (enforced via CI)

### Key Types

- `TerminalSession` - PTY session with metadata
- `AIRequest` / `AIResponse` - OpenRouter API contracts
- `CommandResult` - Shell command execution result
- `Theme` / `ThemeColors` - Terminal color scheme
- `FileEntry` - Directory tree entry (recursive)
- `ElectronAPI` - Preload-exposed interface (window.electronAPI)
