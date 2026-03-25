# AITerminal CodeMaps

This directory contains visual code maps and architectural documentation for the AITerminal project.

## Purpose

CodeMaps provide visual representations of the codebase architecture, data flows, and system design patterns. They serve as:

- **Onboarding Tools**: Quick visual reference for new contributors
- **Architecture Documentation**: High-level system design overviews
- **Data Flow Diagrams**: How data moves through the system
- **Integration Guides**: How ecosystem components connect

## Directory Structure

```
docs/CODEMAPS/
├── README.md                    # This file
├── architecture/                # System architecture diagrams
├── data-flows/                  # Data flow diagrams
├── components/                  # Component relationship maps
└── integrations/                # Ecosystem integration diagrams
```

## Key Architecture Patterns

### Multi-Session PTY Management
- **Manager**: `TerminalSessionManager` (main process)
- **Session Scope**: All IPC communication uses `sessionId`
- **Bridge**: `createPtyBridge()` returns `{ writeToPty, resizePty, dispose }`

### AI Query Routing
- **Client**: `OpenRouterClient` implements `IAIClient`
- **Presets**: Model routing via `RouterPreset`
- **Stream**: Chunked streaming via `ai-stream-chunk` IPC events

### Natural Language Detection
- **Service**: Pure functions in `shell-service.ts`
- **Heuristics**: Question starters, request phrases, TUI mode detection
- **Routing**: NL → chat sidebar, shell → PTY write

## File References

- **Project Structure**: See `CLAUDE.md` for detailed architecture overview
- **IPC Handlers**: `src/main/ipc-handlers.ts`
- **Session Management**: `src/main/terminal-session-manager.ts`
- **AI Client**: `src/ai/openrouter-client.ts`
- **Shell Service**: `src/shell/shell-service.ts`

## Contributing

When adding new code maps:
1. Place in the appropriate subdirectory
2. Use clear, descriptive filenames
3. Include a legend or explanation if needed
4. Keep diagrams up-to-date with code changes

## Related Documentation

- [Main README](../../README.md)
- [Ecosystem Integrations](../ECOSYSTEM.md)
- [CLAUDE.md](../../CLAUDE.md) - Development guide
