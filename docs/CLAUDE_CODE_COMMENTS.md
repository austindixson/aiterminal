# Claude Code Comments - Context-Aware Voice Feedback

The Claude Code Comments system provides **intelligent, context-aware voice feedback** during your Claude Code sessions. The agent demonstrates actual comprehension of what you're building and speaks meaningfully about it.

## What Makes This Different

**Not generic comments.** The agent understands:
- **What framework/language** you're using (React, Vue, Python, Go, Rust...)
- **What tools** you're running (Vite, Webpack, pytest, Jest...)
- **What files** you're editing
- **What commands** you're executing
- **What your goal** is (building, testing, debugging, deploying...)
- **What errors** you're hitting and what they mean

## Examples of Actual Comments

### When Starting a New Project
Based on what the agent detects:

```
"Starting a Vite project! I'll watch your progress."
"Starting work on a TypeScript project. Let me know if you need anything!"
"Building something new! I'll follow along and help where I can."
```

### When Running Commands
The agent comments on the specific action:

```
"Installing dependencies with npm. This might take a moment."
"Starting the dev server. Let's see if everything comes up cleanly."
"Running tests. Fingers crossed!"
"Building the project. Hope there are no surprises."
```

### When Editing Files
The agent knows what you're working on:

```
"Working on UserProfile.tsx. Making progress!"
"Editing the main router. Good stuff."
```

### When Errors Occur
Specific, helpful error commentary:

```
"Looks like eslint isn't installed. Might need to install that dependency."
"Permission issue. Maybe check ownership or permissions on that file."
"Missing module. Probably need to install a dependency."
"TypeScript error. Probably a type mismatch somewhere."
"Test failure. Let's see what broke."
"Port's already in use. Something's already running on that port."
"Hit a syntax error. These things happen."
```

### When Progress is Made
Context-aware celebration:

```
"Vitest passing! Nice work."
"Build succeeded! Ready to ship."
"Got that sorted! Good debugging."
```

### When Stuck
Helpful suggestions based on the actual error:

```
"Seeing the same 'command not found' error repeatedly. Want to try a different approach?"
"Seems like we're going in circles. Maybe take a step back and rethink this?"
```

## How It Works

### 1. Context Extraction
The system parses your Claude Code logs to extract:

**Tool Usage:**
- `bash` commands → package manager, framework, test runner
- `write_to_file` / `read_file` → language, file types, project structure
- `search` → exploration phase

**Conversation Analysis:**
- User messages → current goal (building, testing, debugging, deploying)
- Assistant responses → progress indicators
- Tool outputs → errors, successes

### 2. Pattern Recognition

**Framework Detection:**
- Commands: `vite`, `webpack`, `next`, `react-scripts`, `pytest`, `jest`, `vitest`
- Files: `.tsx`, `.ts`, `.vue`, `.py`, `.go`, `.rs`, `Dockerfile`
- Config: `package.json`, `tsconfig.json`, `pyproject.toml`

**Project Type Detection:**
- TypeScript/JavaScript → Node.js/TypeScript/React
- Python → Python project
- Go → Go project
- Rust → Rust project
- Docker → Docker/Docker Compose

**Goal Inference:**
- "build/compile" → building project
- "test" → testing
- "deploy" → deploying
- "fix/bug" → debugging
- "add/create/implement" → implementing feature
- "refactor" → refactoring
- "help/how do" → learning/exploring

### 3. Comment Generation

Comments are generated based on:
1. **New project detected** → framework-specific welcome
2. **First meaningful action** → action-specific encouragement
3. **File operations** → file-aware progress acknowledgment
4. **Errors** → specific error type acknowledgment
5. **Achievements** → framework-specific celebration
6. **Stuck detection** → helpful suggestion based on actual error

## Rate Limiting

To avoid being too chatty:
- **Default**: 15 seconds minimum between comments
- **Configurable** in `App.tsx`

## Configuration

```typescript
const claudeCodeComments = useClaudeCodeComments({
  minCommentInterval: 15000, // 15 seconds between comments
  onComment: (comment) => {
    // Speak the comment via TTS
    voice.speak(comment).catch((err) => {
      console.error('[App] Failed to speak Claude Code comment:', err)
    })
  },
})
```

## Debugging

Check the browser console to see what's detected:

```javascript
[useClaudeCodeComments] Generated comment: {
  type: "new-project",
  message: "Starting a Vite project! I'll watch your progress.",
  priority: "high",
  context: { framework: "Vite" }
}
```

## Extending the System

Want more specific comments? Edit `generateContextualComment()` in `src/renderer/hooks/useClaudeCodeComments.ts`:

```typescript
// Add your own patterns
if (lastCommand.includes('your-framework')) {
  return {
    type: 'first-command',
    message: `Custom comment for your framework!`,
    timestamp: Date.now(),
    priority: 'medium',
    context: { tool: lastCommand },
  };
}
```

## Testing

Run the test suite:

```bash
npx vitest run src/renderer/hooks/useClaudeCodeComments.test.ts
```

## Files

- **Hook**: `src/renderer/hooks/useClaudeCodeComments.ts`
- **Context Analyzer**: `src/renderer/hooks/useContextAnalyzer.ts`
- **Integration**: `src/renderer/App.tsx`
- **Tests**: `src/renderer/hooks/useClaudeCodeComments.test.ts`

## Data Flow

```
Claude Code Session (JSONL)
    ↓
Log Watcher (IPC)
    ↓
useClaudeCodeComments Hook
    ↓
Context Extraction (framework, tools, files, goals)
    ↓
Pattern Matching (new project, errors, achievements)
    ↓
Contextual Comment Generation
    ↓
TTS (Kokoro) + Lip-Sync
    ↓
Agent Speaks
```

## Troubleshooting

**Agent not speaking?**
1. Check Claude Code backend is selected
2. Verify TTS works (check browser console)
3. Ensure Kokoro TTS is running
4. Check that sessions exist: `~/.config/claude-code/sessions/` or `~/.claude-code/sessions/`

**Comments feel generic?**
- The system needs more data to be specific
- Let it run for a few commands to gather context
- Check console logs to see what's being detected

**Too many comments?**
- Increase `minCommentInterval` in `App.tsx`

**Want more specific comments?**
- Add patterns to `generateContextualComment()`
- Extend `extractProjectContext()` to detect more frameworks/tools
- Customize comment templates for your workflow
