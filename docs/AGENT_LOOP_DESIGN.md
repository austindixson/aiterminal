# AITerminal Agent Loop Architecture

**Status:** Design Phase
**Authors:** hotAsianIntern skill + OpenClaw patterns
**Date:** 2026-03-24

## Overview

Multi-intern agent loop for AITerminal that routes tasks to specialized AI interns (Mei, Sora, Hana), maintains persistent transcripts with vector search, and integrates seamlessly into AITerminal's terminal/chat hybrid UI.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     AITerminal Main Process                      │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                   Agent Router Loop                         │  │
│  │  • Classify task → dispatch intern                         │  │
│  │  • Manage session serialization                             │  │
│  │  • Emit event streams (lifecycle/tool/assistant/handoff)    │  │
│  │  • Enforce timeouts & quality gates                         │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
  ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
  │     Mei      │   │     Sora     │   │     Hana     │
  │ (Dev/Code)   │   │  (Research)  │   │  (Content)   │
  │              │   │              │   │              │
  │ • Claude     │   │ • Context7   │   │ • Drafting   │
  │   Code       │   │ • Web Search │   │ • Publishing │
  │ • TDD        │   │ • Analysis   │   │ • SEO        │
  └───────────────┘   └───────────────┘   └───────────────┘
          │                   │                   │
          └───────────────────┼───────────────────┘
                              │
          ┌───────────────────▼───────────────────────┐
          │       Intern Session Manager               │
          │  • Per-intern workspaces                   │
          │  • Background process spawning             │
          │  • Stream aggregation                      │
          └─────────────────────────────────────────────┘
                              │
          ┌───────────────────▼───────────────────────┐
          │       Transcript Storage (lossless)        │
          │  • SQLite + FTS5 full-text search          │
          │  • Vector embeddings for semantic search   │
          │  • Session replay & context injection       │
          └─────────────────────────────────────────────┘
```

---

## Core Components

### 1. Agent Router Loop (`src/agent-loop/router.ts`)

**Purpose:** Classify tasks and dispatch to appropriate intern.

```typescript
interface TaskClassification {
  intern: 'mei' | 'sora' | 'hana';
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  suggestedChains?: ('mei' | 'sora' | 'hana')[];
}

interface AgentLoopConfig {
  sessionId: string;
  workspaceRoot: string;
  transcriptDb?: string;  // Path to lossless SQLite
  timeouts: {
    mei: number;    // Default: 600s (coding takes time)
    sora: number;   // Default: 120s (research fast)
    hana: number;   // Default: 180s (writing medium)
  };
  qualityGates: {
    requireTests: boolean;      // Mei: TDD enforcement
    requireSources: boolean;     // Sora: cite sources
    requireReview: boolean;      // Hana: proofread
  };
}

async function runAgentLoop(
  userMessage: string,
  config: AgentLoopConfig,
): Promise<AgentLoopResult> {
  // Phase 1: Classify
  const classification = classifyTask(userMessage);

  // Phase 2: Spawn intern
  const internSession = spawnInternSession({
    intern: classification.intern,
    task: userMessage,
    workspace: resolveInternWorkspace(classification.intern, config.workspaceRoot),
    timeout: config.timeouts[classification.intern],
    transcriptDb: config.transcriptDb,
  });

  // Phase 3: Stream events
  for await (const event of internSession.stream()) {
    switch (event.stream) {
      case 'lifecycle':
        emitIpc('agent:lifecycle', event.data);
        break;
      case 'tool':
        emitIpc('agent:tool', event.data);
        break;
      case 'assistant':
        emitIpc('agent:delta', event.data);
        break;
      case 'handoff':
        // Intern requests chain to another intern
        await handleHandoff(event.data, internSession);
        break;
    }
  }

  // Phase 4: Quality gate
  const result = await internSession.result();
  if (!passesQualityGate(result, config.qualityGates)) {
    return { status: 'failed', reason: 'quality-gate' };
  }

  // Phase 5: Persist transcript
  await persistTranscript(config.transcriptDb, {
    sessionId: config.sessionId,
    intern: classification.intern,
    messages: result.messages,
    metadata: result.metadata,
  });

  return { status: 'ok', result };
}
```

---

### 2. Task Classifier (`src/agent-loop/classifier.ts`)

**Purpose:** Map user input to intern based on domain triggers.

```typescript
function classifyTask(input: string): TaskClassification {
  const normalized = input.toLowerCase().trim();

  // Mei triggers (dev)
  const meiTriggers = [
    'code', 'test', 'bug', 'fix', 'refactor', 'api', 'database',
    'deploy', 'ci', 'stripe', 'payment', 'webhook', 'security',
    'scaffold', 'optimize', 'review code', 'pr', 'commit'
  ];

  // Sora triggers (research)
  const soraTriggers = [
    'research', 'compare', 'analyze', 'investigate', 'summarize',
    'look into', 'what is', 'how does', 'evaluate', 'find',
    'best practice', 'documentation'
  ];

  // Hana triggers (content+biz)
  const hanaTriggers = [
    'write', 'blog', 'tweet', 'post', 'copy', 'draft', 'docs',
    'landing page', 'pricing', 'marketing', 'pitch', 'investor',
    'seo', 'content strategy', 'announcement'
  ];

  const meiScore = meiTriggers.filter(t => normalized.includes(t)).length;
  const soraScore = soraTriggers.filter(t => normalized.includes(t)).length;
  const hanaScore = hanaTriggers.filter(t => normalized.includes(t)).length;

  // Multi-domain: chain interns
  if (meiScore > 0 && soraScore > 0) {
    return {
      intern: 'sora',  // Research first, then dev
      confidence: 'high',
      reasoning: 'Research → Development chain',
      suggestedChains: ['sora', 'mei']
    };
  }

  if (soraScore > 0 && hanaScore > 0) {
    return {
      intern: 'sora',  // Research → Content
      confidence: 'high',
      reasoning: 'Research → Content publishing',
      suggestedChains: ['sora', 'hana']
    };
  }

  // Single intern
  const maxScore = Math.max(meiScore, soraScore, hanaScore);
  if (maxScore === 0) {
    return {
      intern: 'sora',  // Default: research/clarify
      confidence: 'low',
      reasoning: 'No clear trigger, defaulting to research for clarification'
    };
  }

  if (meiScore === maxScore) {
    return { intern: 'mei', confidence: 'high', reasoning: 'Development task detected' };
  }
  if (soraScore === maxScore) {
    return { intern: 'sora', confidence: 'high', reasoning: 'Research task detected' };
  }
  return { intern: 'hana', confidence: 'high', reasoning: 'Content task detected' };
}
```

---

### 3. Intern Session Manager (`src/agent-loop/intern-session.ts`)

**Purpose:** Spawn, monitor, and aggregate results from background intern processes.

**Architecture:**
- Each intern runs in isolated workspace
- Mei: spawns Claude Code/codex via `bash pty:true` (like OpenClaw's coding-agent)
- Sora: runs in-process with Context7 + web search
- Hana: runs in-process with drafting tools

```typescript
interface InternSessionConfig {
  intern: 'mei' | 'sora' | 'hana';
  task: string;
  workspace: string;
  timeout: number;
  transcriptDb?: string;
  contextFromHandoff?: HandoffContext;  // From chained interns
}

async function spawnInternSession(config: InternSessionConfig): Promise<InternSession> {
  // Ensure workspace exists
  await ensureInternWorkspace(config.intern, config.workspace);

  // Inject context from previous intern (if chained)
  let enhancedTask = config.task;
  if (config.contextFromHandoff) {
    enhancedTask = injectHandoffContext(config.task, config.contextFromHandoff);
  }

  // Spawn based on intern type
  switch (config.intern) {
    case 'mei':
      return spawnMeiSession(enhancedTask, config);
    case 'sora':
      return spawnSoraSession(enhancedTask, config);
    case 'hana':
      return spawnHanaSession(enhancedTask, config);
  }
}

// Mei: Spawn background process (Claude Code/codex)
async function spawnMeiSession(task: string, config: InternSessionConfig) {
  const agentChoice = detectCodingAgent();  // claude | codex | pi

  const command = agentChoice === 'claude'
    ? `claude --permission-mode bypassPermissions --print '${task}'`
    : `codex exec --full-auto '${task}'`;

  const sessionId = await dietmcpExec({
    server: 'bash',
    tool: 'exec',
    argsJson: JSON.stringify({
      command,
      pty: agentChoice !== 'claude',  // Claude Code doesn't need PTY
      workdir: config.workspace,
      background: true,
      timeout: config.timeout,
    })
  });

  return new InternSession(sessionId, config.intern, config.transcriptDb);
}

// Sora: In-process with Context7
async function spawnSoraSession(task: string, config: InternSessionConfig) {
  // Run in-process, streaming results
  const session = new InProcessInternSession('sora', async (signal) => {
    // 1. Web search for context
    const searchResults = await webSearch(task);

    // 2. Context7 lookup for technical docs
    const docs = await context7Lookup(task);

    // 3. Synthesize research
    return synthesizeResearch(task, searchResults, docs);
  });

  return session;
}
```

---

### 4. Transcript Storage (`src/agent-loop/transcript.ts`)

**Purpose:** Persistent SQLite storage with FTS5 + vector embeddings (lossless-claude pattern).

**Schema:**

```sql
-- Conversations (intern sessions)
CREATE TABLE intern_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT UNIQUE NOT NULL,
  intern TEXT NOT NULL CHECK (intern IN ('mei', 'sora', 'hana')),
  task TEXT NOT NULL,
  classification_confidence TEXT,
  status TEXT CHECK (status IN ('running', 'completed', 'failed', 'handoff')),
  started_at TEXT DEFAULT (datetime('now')),
  ended_at TEXT,
  workspace_path TEXT,
  metadata_json TEXT  -- Flexible metadata
);

-- Messages (within conversation)
CREATE TABLE intern_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES intern_conversations(id),
  seq INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  token_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(conversation_id, seq)
);

-- Handoffs (intern chaining)
CREATE TABLE intern_handoffs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_conversation_id INTEGER REFERENCES intern_conversations(id),
  to_conversation_id INTEGER REFERENCES intern_conversations(id),
  handoff_reason TEXT,
  context_json TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- FTS5 for full-text search
CREATE VIRTUAL TABLE intern_messages_fts
  USING fts5(content, tokenize='porter unicode61');

-- Vector embeddings (for semantic search)
CREATE TABLE intern_embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL REFERENCES intern_messages(id),
  embedding_vector BLOB,  -- Float32 array
  model TEXT DEFAULT 'text-embedding-3-small',
  created_at TEXT DEFAULT (datetime('now'))
);
```

**Vector Search:**

```typescript
// Semantic search across intern transcripts
async function semanticSearch(
  query: string,
  filters?: { intern?: string; dateRange?: [Date, Date] },
  limit: number = 10,
): Promise<TranscriptSearchResult[]> {
  // 1. Embed query using OpenRouter embeddings
  const queryEmbedding = await embedText(query);

  // 2. Search similar vectors (cosine similarity)
  const results = await db.query(`
    SELECT
      im.id,
      im.content,
      ic.intern,
      ic.task,
      ic.started_at
    FROM intern_embeddings ie
    JOIN intern_messages im ON im.id = ie.message_id
    JOIN intern_conversations ic ON ic.id = im.conversation_id
    WHERE ?
    ORDER BY cosine_distance(ie.embedding_vector, ?)
    LIMIT ?
  `, [buildWhereClause(filters), queryEmbedding, limit]);

  return results;
}
```

---

### 5. Handoff Protocol (`src/agent-loop/handoff.ts`)

**Purpose:** Enable interns to chain work by passing context.

```typescript
interface HandoffContext {
  fromIntern: string;
  toIntern: string;
  reason: string;
  findings: Record<string, unknown>;
  sources?: string[];
  recommendedAction?: string;
}

async function handleHandoff(
  handoff: HandoffContext,
  currentSession: InternSession,
): Promise<void> {
  // 1. Persist handoff record
  await db.insert('intern_handoffs', {
    from_conversation_id: currentSession.conversationId,
    to_conversation_id: null,  // Will be set on spawn
    handoff_reason: handoff.reason,
    context_json: JSON.stringify(handoff),
  });

  // 2. Spawn next intern with injected context
  const nextSession = await spawnInternSession({
    intern: handoff.toIntern as 'mei' | 'sora' | 'hana',
    task: handoff.recommendedAction || `Continue based on findings`,
    workspace: resolveInternWorkspace(handoff.toIntern),
    timeout: getTimeoutForIntern(handoff.toIntern),
    contextFromHandoff: handoff,
  });

  // 3. Update handoff record
  await db.update('intern_handoffs', {
    to_conversation_id: nextSession.conversationId,
  });

  // 4. Stream events from new session
  for await (const event of nextSession.stream()) {
    emitIpc('agent:delta', event);
  }
}
```

---

## AITerminal Integration

### New "Agent Mode" (`src/renderer/components/AgentMode.tsx`)

**UI Components:**

```typescript
// Toggle between normal chat and agent loop mode
<Switch
  checked={agentModeEnabled}
  onChange={(checked) => setAgentModeEnabled(checked)}
  label="Agent Mode"
  description="Route tasks to specialized interns (Mei, Sora, Hana)"
/>

// Show active intern status
<InternStatus
  intern={activeIntern}
  status={sessionStatus}
  workspace={currentWorkspace}
  elapsedMs={elapsedTime}
/>

// Streaming output with intern attribution
<AgentStream
  events={agentEvents}
  onHandoff={(handoff) => showHandoffDialog(handoff)}
/>
```

### IPC Handlers (`src/main/ipc-handlers.ts`)

```typescript
// New IPC channels for agent loop
ipcMain.handle('agent:start', async (_event, request) => {
  const { task, config } = request;

  const sessionId = generateSessionId();
  const runId = generateRunId();

  // Return immediately (async start)
  runAgentLoop(task, {
    sessionId,
    workspaceRoot: path.join(homedir(), '.interns'),
    transcriptDb: path.join(homedir(), '.interns/transcripts.db'),
    timeouts: { mei: 600, sora: 120, hana: 180 },
    qualityGates: { requireTests: true, requireSources: true, requireReview: false },
  }).then(result => {
    mainWindow?.webContents.send('agent:complete', { runId, result });
  });

  return { runId, sessionId, acceptedAt: Date.now() };
});

ipcMain.handle('agent:stream', async (event) => {
  // Subscribe to agent events
  const unsubscribe = subscribeAgentEvents((evt) => {
    event.sender.send('agent:event', evt);
  });

  return () => unsubscribe();
});
```

### Terminal Integration (`src/shell/shell-service.ts`)

**New command:** `/agent <task>` in terminal triggers agent loop.

```typescript
// Detect `/agent` command
function isAgentCommand(input: string): boolean {
  return input.trim().startsWith('/agent ');
}

// Route to agent loop
async function handleAgentCommand(input: string): Promise<void> {
  const task = input.replace('/agent ', '').trim();

  // Send to agent loop via IPC
  const result = await ipcRenderer.invoke('agent:start', { task });

  // Show "Agent started" message in terminal
  appendToTerminal(`\n🤖 Agent started (runId: ${result.runId})\n`);

  // Stream results back to terminal
  ipcRenderer.on('agent:event', (_event, data) => {
    if (data.stream === 'assistant') {
      appendToTerminal(data.data.text);
    }
  });
}
```

---

## Quality Gates

### Mei (Dev)
- **TDD Enforcement:** Tests must exist before implementation (enforced via `tdd-workflow` skill)
- **Code Review:** Runs `code-reviewer` agent after completion
- **Security Scan:** Runs `security-reviewer` for auth/payment code
- **Coverage:** Enforces 80%+ test coverage

### Sora (Research)
- **Source Citation:** Must cite sources for all claims
- **Context7 Verification:** Technical docs verified via official docs
- **Synthesis Quality:** Research must be actionable (not just copy-paste)

### Hana (Content)
- **SEO Check:** Runs SEO analysis on published content
- **Proofread:** Grammar and style check
- **Platform Format:** Ensures content matches platform (tweet vs blog vs LinkedIn)

---

## File Structure

```
src/agent-loop/
├── index.ts                    # Public API
├── router.ts                   # Main agent loop
├── classifier.ts               # Task → intern mapping
├── intern-session.ts           # Session management
├── interns/
│   ├── mei.ts                  # Dev intern (Claude Code/codex)
│   ├── sora.ts                 # Research intern (Context7)
│   ├── hana.ts                 # Content intern (drafting)
│   └── workspace.ts            # Per-intern workspace management
├── transcript/
│   ├── db.ts                   # SQLite connection (lossless pattern)
│   ├── schema.ts               # Database migrations
│   ├── embeddings.ts           # Vector search
│   └── search.ts               # FTS5 + semantic search
├── handoff.ts                  # Intern chaining protocol
├── quality-gates.ts            # Result validation
└── events.ts                   # Event stream types

src/renderer/components/
├── AgentMode.tsx               # Agent mode toggle + status
├── AgentStream.tsx             # Streaming output display
└── InternStatus.tsx            # Active intern indicator

src/main/
├── agent-loop-handlers.ts      # IPC handlers for agent loop
└── agent-loop-bridge.ts        # Bridge to lossless + ecosystem
```

---

## Configuration (`.env.example`)

```bash
# Agent Loop Settings
AITERMINAL_AGENT_MODE_ENABLED=true
AITERMINAL_INTERN_WORKSPACE_ROOT=~/.interns
AITERMINAL_TRANSCRIPT_DB=~/.interns/transcripts.db

# Intern Timeouts (seconds)
AITERMINAL_TIMEOUT_MEI=600
AITERMINAL_TIMEOUT_SORA=120
AITERMINAL_TIMEOUT_HANA=180

# Quality Gates
AITERMINAL_REQUIRE_TESTS=true
AITERMINAL_REQUIRE_SOURCES=true
AITERMINAL_REQUIRE_REVIEW=false

# Vector Embeddings (for semantic search)
AITERMINAL_EMBEDDING_MODEL=text-embedding-3-small
AITERMINAL_EMBEDDING_PROVIDER=openai

# Coding Agent Detection (claude | codex | pi)
AITERMINAL_DEFAULT_CODING_AGENT=claude
```

---

## Future Enhancements

1. **Parallel Intern Execution:** Run Mei + Sora in parallel for "research + implement" workflows
2. **Custom Interns:** Allow users to define custom interns via skills
3. **Intern Marketplace:** Share intern configurations via ClawHub-style registry
4. **Auto-Chaining:** Agent suggests optimal intern order based on task complexity
5. **Cost Tracking:** Track per-intern API costs and budget enforcement
6. **Review Queue:** Queue multi-step tasks for human review at each gate

---

## References

- **OpenClaw Agent Loop:** https://github.com/openclaw/openclaw/blob/main/docs/concepts/agent-loop.md
- **Lossless Recall:** https://github.com/RuneweaverStudios/lossless-claude
- **Claude Code:** https://claude.ai/code
- **hotAsianIntern Skill:** `~/.claude/skills/hotAsianIntern/SKILL.md`
