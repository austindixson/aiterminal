# Shared Utilities Codemap

**Last Updated:** 2026-03-25
**Area:** Shared Utilities (ai, shell, themes, file-tree, types, agent-loop, vrm-models)
**Total Files:** 45
**Total Lines:** 4,500

## Architecture
```
src/
├── ai/                  # OpenRouter client, streaming
├── agent-loop/          # Agent loop events and handlers
├── shell/               # Natural language detection
├── themes/              # Terminal color schemes
├── file-tree/           # Directory traversal
├── renderer/            # VRM model utilities
└── types/               # Shared TypeScript types
```

---

## AI Module (`src/ai/`)

**Entry Points:** `index.ts`, `client.ts`

| File | Purpose |
|------|---------|
| `client.ts` | IAIClient interface, factory |
| `openrouter-client.ts` | OpenRouter API implementation |
| `models.ts` | Model presets (claude-3-5-sonnet, etc) |
| `presets.ts` | Router presets for task types |
| `types.ts` | AIRequest, AIResponse, StreamChunk |
| `agent-registry.ts` | Agent metadata registry |
| `stream-manager.ts` | Streaming response handler |
| `openrouter-client.test.ts` | OpenRouter client tests |
| `stream-manager.test.ts` | Stream manager tests |

**Dependencies:** OpenRouter API, fetch/node-fetch

---

## Shell Module (`src/shell/`)

**Entry Points:** `index.ts`, `shell-service.ts`

| File | Purpose |
|------|---------|
| `shell-service.ts` | Natural language detection, routing logic |
| `shell-service.test.ts` | NL detection tests |

**Key Functions:**
- `isNaturalLanguage(input: string): boolean` - Detects NL vs shell commands
- `extractErrorContext(output: string): ErrorContext | null` - Extracts error info
- `classifyTaskType(input: string): TaskType` - Maps to AI presets

**Dependencies:** None (pure functions)

---

## Themes Module (`src/themes/`)

**Entry Points:** `index.ts`, `theme-manager.ts`

| File | Purpose |
|------|---------|
| `theme-manager.ts` | Immutable theme management |
| `types.ts` | Theme, ThemeColors types |
| `dracula.ts` | Dracula color scheme |
| `gruvbox.ts` | Gruvbox dark/light |
| `nord.ts` | Nord color scheme |
| `solarized.ts` | Solarized dark/light |
| `rose-pine.ts` | Rose Pine variants |
| `theme-manager.test.ts` | Theme manager tests |

**Key Pattern:** Immutable - `setTheme()` returns new instance

**Dependencies:** None

---

## File Tree Module (`src/file-tree/`)

**Entry Points:** `index.ts`, `file-tree-service.ts`

| File | Purpose |
|------|---------|
| `file-tree-service.ts` | Directory traversal, ignore patterns |
| `file-tree-service.test.ts` | Tree traversal tests |

**Key Functions:**
- `buildFileTree(rootPath: string): FileEntry[]` - Recursive directory scan
- `applyIgnorePatterns(entries: FileEntry[], patterns: string[])` - Filter files

**Dependencies:** fs, path (Node.js)

---

## Types Module (`src/types/`)

**Entry Point:** `index.ts` (centralized exports)

| File | Purpose |
|------|---------|
| `chat.ts` | ChatMessage, ChatSession types |
| `agent.ts` | AgentRequest, AgentResponse |
| `cmd-k.ts` | Command palette types |
| `autocomplete.ts` | Autocomplete suggestion types |
| `diff.ts` | Diff rendering types |
| `file-context.ts` | File attachment types |
| `file-preview.ts` | File preview state |
| `file-tree.ts` | FileEntry, TreeState |
| `keybindings.ts` | Keybinding registry |
| `terminal-tabs.ts` | TerminalTab, TabState |
| `troubleshoot.ts` | Troubleshooting context |
| `agent-cursor.ts` | Cursor animation types |

**Dependencies:** None (type definitions only)

---

## Agent Loop Module (`src/agent-loop/`)

**Entry Points:** `events.ts`, `handlers.ts`

| File | Purpose |
|------|---------|
| `events.ts` | AgentEvent types, lifecycle event definitions |
| `handlers.ts` | IPC handlers for agent loop operations |
| `agent-loop-handlers.ts` | Main process agent loop handlers |
| `transcript-handlers.ts` | Lossless recall transcript handlers |

**Key Types:**
- `AgentEvent` - Stream, lifecycle, tool, handoff, error events
- `AgentLoopResult` - Execution result with runId and status
- `AgentStreamOptions` - Streaming configuration

**Dependencies:** Electron IPC, agent registry

---

## VRM Models Module (`src/renderer/`)

**Entry Points:** `vrm-models.ts`, `vrm-preloader.ts`

| File | Purpose |
|------|---------|
| `vrm-models.ts` | VRM model configurations for interns (Mei, Sora, Hana) |
| `vrm-preloader.ts` | VRM model caching and preloading system |

**Key Functions:**
- `getModelForIntern(intern: string): VRMModelConfig` - Get model by intern ID
- `getAllModels(): VRMModelConfig[]` - Get all available models
- `getPreloadedVRM(intern: string): PreloadedVRM | null` - Get cached model

**Models:**
- **mei** (美) - Dev specialist - Default VRM model
- **sora** (空) - Research specialist
- **hana** (花) - Content & business specialist

**Dependencies:** Three.js, @pixiv/three-vrm

---

## Data Flow

**AI Query Pattern:**
1. Frontend → `useChat.sendMessage()`
2. `shell-service.ts` classifies task type
3. `RouterPreset` selects model
4. `OpenRouterClient.streamQuery()` executes
5. Chunks → `StreamManager` buffers
6. Frontend receives via IPC

**Theme Application:**
1. User selects theme → `ThemeManager.setTheme()`
2. Returns new manager instance (immutable)
3. IPC to main → saves to localStorage
4. Renderer applies via xterm.js `setOption()`
5. CSS custom properties update UI colors

## External Dependencies
- **OpenRouter API** - AI model routing
- **fs/path** - File system operations

## Related Areas
- [frontend.md](frontend.md) - UI components using these utilities
- [backend.md](backend.md) - Main process integration
