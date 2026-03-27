# Claude Code Log Reading - Usage Example

This document demonstrates how to use the Claude Code log reading IPC bridge in AITerminal.

## API Overview

### Main Process (`/src/main/ipc-handlers.ts`)

The IPC handler provides:
- `get-claude-code-log` - Read the last N messages from Claude Code sessions
- `start-claude-code-log-watcher` - Start watching for session updates
- `stop-claude-code-log-watcher` - Stop the file watcher

### Renderer API (`/src/main/preload.ts`)

Exposed via `window.electronAPI`:
- `getClaudeCodeLog(limit?: number)` - Fetch recent messages
- `startClaudeCodeLogWatcher()` - Start watching for updates
- `stopClaudeCodeLogWatcher()` - Stop watching
- `onClaudeCodeLogUpdated(callback)` - Subscribe to update events

### Types (`/src/types/index.ts`)

```typescript
interface ClaudeCodeMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp?: number;
  tools?: Array<{
    name: string;
    input?: Record<string, unknown>;
    output?: string;
    error?: string;
  }>;
}
```

## Usage Example

### React Component

```typescript
import React, { useEffect, useState } from 'react';

const ClaudeCodeHistory: React.FC = () => {
  const [messages, setMessages] = useState<ClaudeCodeMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load initial messages
  useEffect(() => {
    const loadMessages = async () => {
      setLoading(true);
      const result = await window.electronAPI.getClaudeCodeLog(50);
      setLoading(false);

      if (result.success && result.messages) {
        setMessages(result.messages);
      } else {
        setError(result.error || 'Failed to load messages');
      }
    };

    loadMessages();

    // Start watching for updates
    window.electronAPI.startClaudeCodeLogWatcher();

    // Subscribe to updates
    const unsubscribe = window.electronAPI.onClaudeCodeLogUpdated((data) => {
      setMessages(data.messages);
    });

    // Cleanup
    return () => {
      unsubscribe();
      window.electronAPI.stopClaudeCodeLogWatcher();
    };
  }, []);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h2>Claude Code Session History</h2>
      {messages.map((msg, idx) => (
        <div key={idx}>
          <strong>{msg.role}:</strong>
          <pre>{msg.content}</pre>
          {msg.tools && (
            <div>
              Tools used:
              {msg.tools.map((tool, toolIdx) => (
                <div key={toolIdx}>
                  - {tool.name}: {tool.output || tool.error || 'running...'}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
```

## Session Directory Detection

The handler automatically checks these locations:
1. `~/.config/claude-code/sessions/`
2. `~/.claude-code/sessions/`

It reads the most recently modified `.jsonl` file and parses it as JSONL (one JSON object per line).

## Error Handling

The API returns success/error status for all operations:

```typescript
const result = await window.electronAPI.getClaudeCodeLog(100);

if (!result.success) {
  console.error('Failed to load:', result.error);
  // Handle error (e.g., show UI message, retry, etc.)
}
```

Common errors:
- "Claude Code sessions directory not found" - Claude Code hasn't been run yet
- "No Claude Code sessions found" - No session files exist
- File system errors - Permission issues, corrupted files, etc.

## File Watcher Behavior

The file watcher monitors the Claude Code sessions directory for changes:
- When any `.jsonl` file is modified, it reads the entire file
- Updates are broadcast to all renderer windows via `claude-code-log-updated` events
- Multiple windows can subscribe simultaneously
- The watcher is automatically cleaned up when stopped

## Performance Considerations

- Session files are read in full on each update
- For large session histories, consider reducing the `limit` parameter
- The watcher debounces file system events (OS-level)
- JSONL parsing is strict: malformed lines are silently skipped
