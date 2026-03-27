# Frontend Codemap

**Last Updated:** 2026-03-25
**Area:** React UI (renderer process)
**Total Files:** 48 (non-test TypeScript/TSX files)
**Total Lines:** ~7,200
**CSS Files:** 11

## Entry Points

| File | Purpose |
|------|---------|
| `src/renderer/main.tsx` | React application root, renders App to DOM |
| `src/renderer/App.tsx` | Main application component, layout root, state orchestration |

## Architecture

```
src/renderer/
├── components/          # React components (26 files)
│   ├── Chat*.tsx       # Chat sidebar and messages
│   ├── Terminal*.tsx   # Terminal view and tabs
│   ├── CmdKBar.tsx     # Command palette (Cmd+K)
│   ├── FileTree.tsx    # File browser component
│   ├── DiffView.tsx    # Diff viewer for agent edits
│   ├── Agent*.tsx      # Agent approval and cursors
│   ├── InternAvatar.tsx # VRM 3D avatar visualizer
│   ├── AgentSelector.tsx # Agent/intern dropdown selector
│   ├── VRMModelSelector.tsx # VRM model picker modal
│   └── icons/          # Icon components
│       └── ToggleIcon.tsx # VS Code-style chevron toggles
├── hooks/              # Custom React hooks (16 files)
│   ├── useChat.ts      # Chat state management
│   ├── useCmdK.ts      # Command palette logic
│   ├── useAgent.ts     # Agent approval workflow
│   ├── useAgentLoop.ts # Agent loop state and events
│   ├── useTerminalTabs.ts # Multi-session tab management
│   └── ...
├── vrm-models.ts       # VRM model configurations
├── vrm-preloader.ts    # VRM model caching and preloading
└── styles/             # CSS modules (11 files)
    ├── chat.css
    ├── components.css
    ├── global.css
    └── ...
```

## Key Modules

### Components (21 files)

| File | Purpose |
|------|---------|
| `components/ChatSidebar.tsx` | Chat input, message history, attachment handling |
| `components/ChatMessage.tsx` | Individual chat message rendering |
| `components/TerminalView.tsx` | xterm.js terminal instance wrapper |
| `components/TerminalTabBar.tsx` | Tab bar for multi-session management |
| `components/CmdKBar.tsx` | Command palette with fuzzy search |
| `components/AutocompleteDropdown.tsx` | Shell command autocomplete UI |
| `components/DiffView.tsx` | Unified diff viewer for agent edits |
| `components/FileTree.tsx` | Interactive directory browser |
| `components/FilePicker.tsx` | File selection modal (@-mention support) |
| `components/FilePreview.tsx` | File content viewer with syntax highlighting |
| `components/AgentApprovalPanel.tsx` | Agent plan review and approval UI |
| `components/AgentCursor.tsx` | Animated cursor for agent activity |
| `components/AgentCursorsOverlay.tsx` | Multi-cursor overlay layer |
| `components/StreamingText.tsx` | Incremental text rendering for AI responses |
| `components/AIResponsePanel.tsx` | AI response display container |
| `components/SplitSidebar.tsx` | Left panel combining file tree + terminal tabs |
| `components/ThemeSelector.tsx` | Theme dropdown selector |
| `components/KeybindingsHelp.tsx` | Keyboard shortcuts reference |
| `components/TroubleshootPopup.tsx` | Error troubleshooting modal |
| `components/TroubleshootView.tsx` | Troubleshooting content viewer |
| `components/GatewayVoiceStrip.tsx` | Voice I/O status indicator |
| `components/InternAvatar.tsx` | 3D VRM avatar visualizer with expressions and cursor tracking |
| `components/AgentSelector.tsx` | Minimal inline agent/intern dropdown selector |
| `components/VRMModelSelector.tsx` | VRM model picker modal with tooltips |
| `components/icons/ToggleIcon.tsx` | VS Code-style chevron toggle icons |

### Hooks (15 files)

| File | Purpose |
|------|---------|
| `hooks/useChat.ts` | Chat state, send messages, AI streaming, attachments |
| `hooks/useCmdK.ts` | Command palette open/close, filtering, history |
| `hooks/useAgent.ts` | Agent approval workflow, plan execution |
| `hooks/useAgentLoop.ts` | Agent loop state, events, intern selection |
| `hooks/useTerminalTabs.ts` | Multi-session PTY tab management |
| `hooks/useTerminalLocation.ts` | Terminal position (center/bottom) toggle |
| `hooks/useFileTree.ts` | File tree state, expand/collapse, navigation |
| `hooks/useFilePicker.ts` | File selection modal state, filtering |
| `hooks/useFilePreview.ts` | File preview state, scroll position |
| `hooks/useDiffView.ts` | Diff viewer state, file navigation |
| `hooks/useAutocomplete.ts` | Shell autocomplete state, suggestions |
| `hooks/useTheme.ts` | Theme selection and application |
| `hooks/useStreaming.ts` | Streaming text accumulation logic |
| `hooks/useCursorAnimation.ts` | Agent cursor animation frames |
| `hooks/useDaemonGateway.ts` | Gateway daemon connection status |
| `hooks/useVoiceIO.ts` | Voice input/output state management |
| `hooks/useTroubleshoot.ts` | Troubleshooting popup state |
| `hooks/useKeybindings.ts` | Keyboard shortcuts registry |

### Styles (11 files)

| File | Purpose |
|------|---------|
| `styles/global.css` | Global resets, base styles |
| `styles/components.css` | Shared component styles |
| `styles/chat.css` | Chat sidebar styles |
| `styles/cmd-k.css` | Command palette styles |
| `styles/autocomplete.css` | Autocomplete dropdown styles |
| `styles/file-preview.css` | File preview viewer styles |
| `styles/file-tree.css` | File tree browser styles |
| `styles/diff.css` | Diff viewer styles |
| `styles/agent.css` | Agent approval panel styles |
| `styles/file-picker.css` | File picker modal styles |
| `styles/troubleshoot.css` | Troubleshooting modal styles |
| `styles/agent-cursors.css` | Agent cursor animations |
| `styles/keybindings.css` | Keyboard shortcuts help styles |

## Data Flow

### User Input → Chat → AI

1. User types in terminal → `TerminalView.onCommand()`
2. `isNaturalLanguage()` checks input patterns (from `shell-service.ts`)
3. If NL: inject into chat sidebar → `useChat.injectFromTerminal()`
4. If shell: write to PTY via `writeToSession()`
5. Chat send → `ai-query-stream` IPC (main process)
6. Streaming chunks → `useChat` updates state via `ai-stream-chunk` events
7. `ChatMessage` renders incrementally with `StreamingText`

### Terminal Output → Error Detection

1. PTY data event → `session-data` IPC (includes `sessionId`)
2. `TerminalView` receives data → error pattern detection
3. Errors route to chat with context: `chat.injectFromTerminal()`
4. Successful `cd` commands trigger CWD refresh → `getSessionCwd` IPC

### Cmd+K Flow

1. User presses Cmd+K → `useCmdK.toggle()`
2. `CmdKBar` renders → fuzzy search commands
3. Selection → execute action or navigate
4. Up/down arrows navigate history

### File Tree → Preview Connection

1. User selects file in tree → `handleFileTreeSelect()`
2. `filePreview.openFile(path)` → read file via IPC
3. Preview displays in chat panel area
4. User selects directory → sends `cd` command to active PTY

### Agent Approval Workflow

1. Agent generates plan → `useAgent.setCurrentPlan()`
2. `AgentApprovalPanel` renders operations list
3. User approves/rejects individual ops or all
4. Execute → agent runs approved operations
5. `AgentCursorsOverlay` shows cursor positions during execution

## State Management

**App.tsx** orchestrates all hooks and passes state to components:
- **Local state:** TUI mode, NL routing toast, active tab CWD
- **Hook state:** Chat, CmdK, Agent, TerminalTabs, FileTree, FilePicker, etc.
- **Derived state:** AI active, agent active, bottom panel visibility

**Key State Patterns:**
- Immutable updates (no direct mutation)
- Synchronous refs for critical flags (`tuiModeRef`)
- Cleanup functions for IPC listeners
- Event delegation for keyboard shortcuts

## External Dependencies

- **React 18** - UI framework (no StrictMode, avoids xterm double-mount)
- **Vite** - Build tool and dev server
- **xterm.js** - Terminal emulator (`@xterm/xterm`)
- **Three.js** - 3D rendering engine for VRM avatars
- **@pixiv/three-vrm** - VRM model loader and expression system
- **TypeScript** - Type safety
- **RCSS** - CSS modules (via Vite plugin)

## IPC Communication

**Renderer → Main:**
- `write-to-session(sessionId, data)` - Write to PTY
- `resize-session(sessionId, cols, rows)` - Resize PTY
- `get-session-cwd(sessionId)` - Get shell working directory
- `ai-query-stream` - Send AI query
- `read-file(path)` - Read file content
- `file-tree(path)` - Get directory listing
- `lossless-*` - Lossless recall integration

**Main → Renderer:**
- `session-data(sessionId, data)` - PTY output
- `ai-stream-chunk` - AI response chunks
- `session-exit(sessionId, exitCode)` - PTY exit

## Related Areas

- [backend.md](backend.md) - IPC handlers and main process architecture
- [shared-utilities.md](shared-utilities.md) - AI client, shell service, types
- [integrations.md](integrations.md) - Daemon bridges (lossless, dietmcp, ferroclaw)

## Testing

- **Unit tests:** `*.test.ts` alongside hooks
- **Component tests:** `*.test.tsx` alongside components
- **Test utilities:** `src/test/setup.ts` (jsdom environment, Vitest globals)
- **Coverage goal:** 80%+ (enforced via CI)
- **Run tests:** `npm run test`, `npm run test:watch`

## Key Patterns

**Component Structure:**
- Functional components with hooks
- Props interfaces for type safety
- Event callbacks passed from App.tsx
- Conditional rendering based on state

**Hook Patterns:**
- Custom hooks for domain logic
- Immutable state updates (`setState(prev => ({...prev, ...update}))`)
- Cleanup functions for side effects
- IPC listeners registered in `useEffect`

**Style Architecture:**
- CSS modules via Vite
- Custom properties for theming (`--ansi-*`, `--bg-*`, etc.)
- BEM-like naming: `.component__element--modifier`
- Global styles in `global.css`, component-specific in separate files
