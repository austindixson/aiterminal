# AITerminal Codebase Index

**Last Updated:** 2026-03-24
**Project:** AITerminal - AI/Shell Hybrid Terminal
**Stack:** Electron + React + TypeScript + Vite
**Total Files:** 113 TypeScript/TSX files
**Total Lines:** ~24,305

## Quick Navigation

- **[Frontend](frontend.md)** - React UI components, hooks, styles (42 files, 2,470 lines)
- **[Backend](backend.md)** - Electron main process, IPC handlers (13 files, 1,296 lines)
- **[Integrations](integrations.md)** - Ecosystem bridges (1 file, 279 lines)
- **[Shared Utilities](shared-utilities.md)** - AI, shell, themes, types (37 files, ~16K lines)

## Project Overview

AITerminal is a next-generation terminal application that seamlessly integrates AI assistance with traditional shell workflows. Built on Electron for cross-platform desktop support, React for the UI, and OpenRouter for AI model routing.

### Core Architecture

**Multi-Process Architecture:**
- **Main Process** (Node.js) - PTY management, IPC handlers, file operations
- **Renderer Process** (React/Vite) - UI components, terminal view, chat sidebar
- **PTY Sessions** (node-pty) - Multiple terminal sessions with unique IDs

**Key Patterns:**
- **IPC Bridge Pattern** - `createPtyBridge()` returns `{ writeToPty, resizePty, dispose }`
- **Natural Language Detection** - `isNaturalLanguage()` routes input to AI or shell
- **Theme Immutability** - `ThemeManager.setTheme()` returns new instance
- **File Operation Policy** - `workspace-policy.ts` validates all file paths

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Desktop** | Electron | Cross-platform desktop framework |
| **UI** | React 18 + Vite | Component-based UI, fast dev server |
| **Terminal** | xterm.js | Terminal emulator with ANSI support |
| **PTY** | node-pty | Pseudo-terminal spawning |
| **AI** | OpenRouter API | Model routing and streaming |
| **Testing** | Vitest + Playwright | Unit and E2E tests |
| **Types** | TypeScript | Type-safe development |

## Directory Structure

```
aiterminal/
├── src/
│   ├── main/           # Electron main process
│   ├── renderer/       # React UI
│   ├── ai/             # OpenRouter client
│   ├── shell/          # NL detection and routing
│   ├── themes/         # Terminal color schemes
│   ├── file-tree/      # Directory traversal
│   ├── integrations/   # Ecosystem bridges
│   ├── types/          # Shared types
│   └── test/           # Test utilities
├── docs/
│   ├── CODEMAPS/       # This directory
│   └── ECOSYSTEM.md    # Integration docs
└── package.json
```

## Key Entry Points

| File | Purpose |
|------|---------|
| `src/main/main.ts` | Electron main process entry |
| `src/renderer/main.tsx` | React application root |
| `src/main/preload.ts` | Context bridge for IPC |
| `src/ai/client.ts` | AI client factory |
| `src/shell/shell-service.ts` | Natural language detection |

## Critical Data Flows

### Shell Input → AI Routing
1. User types in terminal
2. `isNaturalLanguage()` checks input patterns
3. If NL: inject into chat sidebar, prevent PTY write
4. If shell: write to PTY via `writeToSession()`

### PTY Output → Error Detection
1. PTY emits data
2. `createPtyBridge()` forwards via `session-data` IPC
3. Renderer checks for error patterns
4. Errors route to chat sidebar with context

### AI Streaming
1. Chat send → `ai-query-stream` IPC
2. `OpenRouterClient.streamQuery()` yields chunks
3. Main sends `ai-stream-chunk` events back to renderer
4. `StreamingText` component renders incrementally

## Development Workflow

**Build & Run:**
```bash
npm run dev          # Start dev server (Vite + Electron)
npm run build        # Build TypeScript + Vite bundle
npm run build:electron  # Build Electron app for distribution
```

**Testing:**
```bash
npm run test         # Run all tests (Vitest)
npm run test:e2e     # Run Playwright E2E tests
npm run test:coverage  # Generate coverage report (target: 80%+)
```

**Linting:**
```bash
npm run lint         # TypeScript type check only
```

## Security Architecture

- **Context Isolation:** Enabled, no node integration
- **Preload Script:** All APIs via `contextBridge`
- **File Operations:** Gated by `workspace-policy.ts`
- **IPC Boundaries:** No remote module, no `eval()`

## Ecosystem Integrations

All integrations are **opt-in** via environment variables:
- **lossless-recall** - Chat history persistence
- **dietmcp** - MCP → CLI bridge
- **ferroclaw** - Local Rust agent
- **kokoro** - Text-to-speech
- **superenv** - Additional secrets

See [Integrations Codemap](integrations.md) for details.

## Related Documentation

- [CLAUDE.md](../../CLAUDE.md) - Project development guide
- [ECOSYSTEM.md](../../ECOSYSTEM.md) - Integration documentation
- [.env.example](../../.env.example) - Environment configuration

## Statistics

| Metric | Value |
|--------|-------|
| Total Files | 113 |
| Total Lines | ~24,305 |
| Languages | TypeScript, TSX |
| Framework | React + Electron |
| Test Coverage Target | 80%+ |
