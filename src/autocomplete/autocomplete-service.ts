/**
 * Autocomplete service — core engine for AI-powered tab completion.
 *
 * Provides:
 * - Local path/file completions via IPC directory reading
 * - Static command completions from a curated map of ~50 common commands
 * - AI-powered smart completions via OpenRouter (fast model)
 * - Merging, deduplication, and ranking of all suggestion sources
 * - LRU cache (20 entries) for AI suggestions
 *
 * All functions are pure or side-effect-isolated. No mutation of inputs.
 */

import type {
  AutocompleteSuggestion,
  AutocompleteContext,
} from '@/types/autocomplete'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_SUGGESTIONS = 8
const AI_CACHE_TTL_MS = 2_000
const AI_CACHE_MAX_ENTRIES = 20

// ---------------------------------------------------------------------------
// Common commands registry (~50 entries)
// ---------------------------------------------------------------------------

const COMMON_COMMANDS: ReadonlyArray<{
  readonly name: string
  readonly description: string
}> = [
  { name: 'git', description: 'Version control system' },
  { name: 'git status', description: 'Show working tree status' },
  { name: 'git add', description: 'Stage changes' },
  { name: 'git commit', description: 'Record changes to repository' },
  { name: 'git push', description: 'Update remote refs' },
  { name: 'git pull', description: 'Fetch and integrate remote changes' },
  { name: 'git log', description: 'Show commit history' },
  { name: 'git diff', description: 'Show changes between commits' },
  { name: 'git branch', description: 'List, create, or delete branches' },
  { name: 'git checkout', description: 'Switch branches or restore files' },
  { name: 'git merge', description: 'Join two or more branches' },
  { name: 'git stash', description: 'Stash changes in working directory' },
  { name: 'git clone', description: 'Clone a repository' },
  { name: 'git init', description: 'Create an empty Git repository' },
  { name: 'git remote', description: 'Manage set of tracked repositories' },
  { name: 'git fetch', description: 'Download objects and refs from remote' },
  { name: 'git rebase', description: 'Reapply commits on top of another base' },
  { name: 'git reset', description: 'Reset current HEAD to a specified state' },
  { name: 'docker', description: 'Container runtime' },
  { name: 'docker ps', description: 'List running containers' },
  { name: 'docker build', description: 'Build an image from Dockerfile' },
  { name: 'docker run', description: 'Run a command in a new container' },
  { name: 'docker-compose', description: 'Define and run multi-container apps' },
  { name: 'docker-compose up', description: 'Create and start containers' },
  { name: 'npm', description: 'Node package manager' },
  { name: 'npm install', description: 'Install package dependencies' },
  { name: 'npm run', description: 'Run a script from package.json' },
  { name: 'npm test', description: 'Run test suite' },
  { name: 'npm start', description: 'Start the application' },
  { name: 'npx', description: 'Execute npm package binaries' },
  { name: 'yarn', description: 'Alternative package manager' },
  { name: 'pnpm', description: 'Fast, disk space efficient package manager' },
  { name: 'cd', description: 'Change directory' },
  { name: 'ls', description: 'List directory contents' },
  { name: 'cat', description: 'Concatenate and display files' },
  { name: 'grep', description: 'Search text using patterns' },
  { name: 'find', description: 'Search for files in a directory hierarchy' },
  { name: 'mkdir', description: 'Create directories' },
  { name: 'rm', description: 'Remove files or directories' },
  { name: 'cp', description: 'Copy files and directories' },
  { name: 'mv', description: 'Move or rename files' },
  { name: 'chmod', description: 'Change file permissions' },
  { name: 'chown', description: 'Change file owner' },
  { name: 'curl', description: 'Transfer data from or to a server' },
  { name: 'wget', description: 'Download files from the web' },
  { name: 'ssh', description: 'Secure shell remote login' },
  { name: 'scp', description: 'Secure copy over SSH' },
  { name: 'tar', description: 'Archive utility' },
  { name: 'zip', description: 'Package and compress files' },
  { name: 'unzip', description: 'Extract compressed files' },
  { name: 'python', description: 'Python interpreter' },
  { name: 'python3', description: 'Python 3 interpreter' },
  { name: 'node', description: 'Node.js runtime' },
  { name: 'which', description: 'Locate a command' },
  { name: 'whoami', description: 'Print current username' },
  { name: 'pwd', description: 'Print working directory' },
  { name: 'echo', description: 'Display a line of text' },
  { name: 'env', description: 'Display environment variables' },
  { name: 'export', description: 'Set environment variable' },
  { name: 'ps', description: 'Report process status' },
  { name: 'kill', description: 'Terminate a process' },
  { name: 'top', description: 'Display system processes' },
  { name: 'htop', description: 'Interactive process viewer' },
  { name: 'man', description: 'Display manual pages' },
  { name: 'head', description: 'Output the first part of files' },
  { name: 'tail', description: 'Output the last part of files' },
  { name: 'less', description: 'View file contents page by page' },
  { name: 'wc', description: 'Print line, word, and byte counts' },
  { name: 'sort', description: 'Sort lines of text files' },
  { name: 'sed', description: 'Stream editor for text transformation' },
  { name: 'awk', description: 'Pattern scanning and processing' },
]

// ---------------------------------------------------------------------------
// AI suggestion cache (LRU)
// ---------------------------------------------------------------------------

interface CacheEntry {
  readonly suggestions: ReadonlyArray<AutocompleteSuggestion>
  readonly timestamp: number
}

const aiCache = new Map<string, CacheEntry>()

/**
 * Clears the AI suggestion cache. Intended for use in tests.
 */
export function clearAICache(): void {
  aiCache.clear()
}

function getCacheKey(context: AutocompleteContext): string {
  return `${context.partialInput}::${context.cwd}`
}

function getCachedSuggestions(
  context: AutocompleteContext,
  now: number,
): ReadonlyArray<AutocompleteSuggestion> | null {
  const key = getCacheKey(context)
  const entry = aiCache.get(key)

  if (!entry) {
    return null
  }

  if (now - entry.timestamp > AI_CACHE_TTL_MS) {
    aiCache.delete(key)
    return null
  }

  return entry.suggestions
}

function setCachedSuggestions(
  context: AutocompleteContext,
  suggestions: ReadonlyArray<AutocompleteSuggestion>,
  now: number,
): void {
  const key = getCacheKey(context)

  // Evict oldest if at capacity
  if (aiCache.size >= AI_CACHE_MAX_ENTRIES && !aiCache.has(key)) {
    const oldestKey = aiCache.keys().next().value
    if (oldestKey !== undefined) {
      aiCache.delete(oldestKey)
    }
  }

  aiCache.set(key, { suggestions, timestamp: now })
}

// ---------------------------------------------------------------------------
// getLocalSuggestions
// ---------------------------------------------------------------------------

/**
 * Returns path completions by reading the filesystem via IPC.
 *
 * Extracts the path portion from the partial input (everything after the
 * last space), determines the directory to scan, and filters entries
 * that match the partial filename.
 */
export async function getLocalSuggestions(
  partial: string,
  cwd: string,
): Promise<ReadonlyArray<AutocompleteSuggestion>> {
  if (partial.trim().length === 0) {
    return []
  }

  try {
    // Extract the argument portion (last space-separated token)
    const parts = partial.split(' ')
    const lastToken = parts[parts.length - 1]
    const prefix = lastToken.toLowerCase()

    // Determine directory to read
    const dirToRead = cwd

    const entries = await window.electronAPI.readDirectory(dirToRead)

    // Filter entries matching the prefix
    const filtered = prefix.length > 0
      ? entries.filter((entry: { name: string }) =>
          entry.name.toLowerCase().startsWith(prefix),
        )
      : entries

    return filtered.map(
      (entry: { name: string; isDirectory: boolean }): AutocompleteSuggestion => ({
        text: entry.name,
        description: entry.isDirectory ? 'directory' : 'file',
        type: 'path',
        confidence: 1.0,
      }),
    )
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// getCommandSuggestions
// ---------------------------------------------------------------------------

/**
 * Returns matching command suggestions from the static commands registry.
 * Case-insensitive prefix matching.
 */
export function getCommandSuggestions(
  partial: string,
): ReadonlyArray<AutocompleteSuggestion> {
  if (partial.trim().length === 0) {
    return []
  }

  const lower = partial.toLowerCase()

  return COMMON_COMMANDS
    .filter((cmd) => cmd.name.toLowerCase().startsWith(lower))
    .map((cmd): AutocompleteSuggestion => {
      // Confidence based on match quality
      const exactMatch = cmd.name.toLowerCase() === lower
      const confidence = exactMatch ? 1.0 : 0.8 + (lower.length / cmd.name.length) * 0.2

      return {
        text: cmd.name,
        description: cmd.description,
        type: 'command',
        confidence: Math.min(confidence, 1.0),
      }
    })
}

// ---------------------------------------------------------------------------
// getAISuggestions
// ---------------------------------------------------------------------------

/**
 * Sends context to AI for smart completions.
 * Uses a fast model (GPT-4o-mini via OpenRouter) for low latency.
 * Results are cached for 2 seconds to avoid redundant calls.
 */
export async function getAISuggestions(
  context: AutocompleteContext,
): Promise<ReadonlyArray<AutocompleteSuggestion>> {
  const now = Date.now()

  // Check cache first
  const cached = getCachedSuggestions(context, now)
  if (cached !== null) {
    return cached
  }

  try {
    const prompt = buildAutocompletePrompt(context)

    const response = await window.electronAPI.aiQuery({
      prompt,
      taskType: 'command_help',
    })

    const parsed = JSON.parse(response.content)

    if (!Array.isArray(parsed)) {
      return []
    }

    const suggestions: ReadonlyArray<AutocompleteSuggestion> = parsed.map(
      (item: { text?: string; description?: string; type?: string; confidence?: number }) => ({
        text: item.text ?? '',
        description: item.description ?? '',
        type: 'ai' as const,
        confidence: typeof item.confidence === 'number' ? item.confidence : 0.5,
      }),
    )

    setCachedSuggestions(context, suggestions, now)
    return suggestions
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// mergeSuggestions
// ---------------------------------------------------------------------------

/**
 * Combines local and AI suggestions, deduplicates by text,
 * and limits to MAX_SUGGESTIONS (8).
 *
 * Local suggestions always come first (higher priority).
 */
export function mergeSuggestions(
  local: ReadonlyArray<AutocompleteSuggestion>,
  ai: ReadonlyArray<AutocompleteSuggestion>,
): ReadonlyArray<AutocompleteSuggestion> {
  const seen = new Set<string>()
  const result: AutocompleteSuggestion[] = []

  // Local first
  for (const suggestion of local) {
    if (!seen.has(suggestion.text)) {
      seen.add(suggestion.text)
      result.push(suggestion)
    }
  }

  // AI after
  for (const suggestion of ai) {
    if (!seen.has(suggestion.text)) {
      seen.add(suggestion.text)
      result.push(suggestion)
    }
  }

  return result.slice(0, MAX_SUGGESTIONS)
}

// ---------------------------------------------------------------------------
// buildAutocompletePrompt
// ---------------------------------------------------------------------------

/**
 * Builds the AI prompt for autocomplete context.
 * Instructs the AI to return a JSON array of suggestions.
 */
export function buildAutocompletePrompt(context: AutocompleteContext): string {
  const recentCmds =
    context.recentCommands.length > 0
      ? `Recent commands:\n${context.recentCommands.map((c) => `  - ${c}`).join('\n')}`
      : 'No recent commands.'

  return [
    `You are a shell autocomplete engine for ${context.shellType}.`,
    `The user is typing a command and needs completions.`,
    '',
    `Partial input: "${context.partialInput}"`,
    `Current directory: ${context.cwd}`,
    recentCmds,
    '',
    `Return a JSON array of completion suggestions. Each object must have:`,
    `- "text": the full completion text`,
    `- "description": a short explanation (under 50 chars)`,
    `- "type": "ai"`,
    `- "confidence": number between 0 and 1`,
    '',
    `Return ONLY valid JSON. No markdown, no explanation. Maximum 5 suggestions.`,
  ].join('\n')
}
