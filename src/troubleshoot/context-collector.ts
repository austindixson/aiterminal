/**
 * ContextCollector — immutable service that collects terminal session context
 * for the AI troubleshoot feature.
 *
 * Uses a ring buffer (max 50 entries) to keep recent terminal activity.
 * All methods return new ContextCollector instances — never mutates.
 */

import type { ConsoleEntry, SessionContext } from '@/types/troubleshoot'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_ENTRIES = 50
const MAX_SYSTEM_PROMPT_LENGTH = 4000

/** Only these env vars pass through the filter — no secrets leak. */
const SAFE_ENV_VARS: ReadonlyArray<string> = [
  'PATH',
  'HOME',
  'SHELL',
  'TERM',
  'LANG',
]

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

let entryCounter = 0

function generateId(): string {
  entryCounter += 1
  return `entry-${Date.now()}-${entryCounter}`
}

function truncateEntries(
  entries: ReadonlyArray<ConsoleEntry>,
): ReadonlyArray<ConsoleEntry> {
  if (entries.length <= MAX_ENTRIES) {
    return entries
  }
  return entries.slice(entries.length - MAX_ENTRIES)
}

function filterEnvVars(): Record<string, string> {
  const filtered: Record<string, string> = {}
  for (const key of SAFE_ENV_VARS) {
    const value = process.env[key]
    if (value !== undefined) {
      filtered[key] = value
    }
  }
  return filtered
}

function formatTimestamp(ts: number): string {
  const date = new Date(ts)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${hours}:${minutes}:${seconds}`
}

// ---------------------------------------------------------------------------
// ContextCollector
// ---------------------------------------------------------------------------

export class ContextCollector {
  private readonly entries: ReadonlyArray<ConsoleEntry>
  private readonly startTime: number

  private constructor(
    entries: ReadonlyArray<ConsoleEntry>,
    startTime: number,
  ) {
    this.entries = entries
    this.startTime = startTime
  }

  /**
   * Factory: create a fresh collector with no entries.
   */
  static create(): ContextCollector {
    return new ContextCollector([], Date.now())
  }

  /**
   * Factory: create a collector pre-loaded with existing entries.
   * Useful when restoring session context from a snapshot.
   */
  static fromEntries(
    entries: ReadonlyArray<ConsoleEntry>,
    startTime: number,
  ): ContextCollector {
    return new ContextCollector(truncateEntries(entries), startTime)
  }

  /**
   * Record a command execution with its output.
   * Returns a new ContextCollector — does not mutate.
   */
  addCommand(
    command: string,
    exitCode: number,
    stdout: string,
    stderr: string,
  ): ContextCollector {
    const now = Date.now()
    const newEntries: ConsoleEntry[] = []

    // Command entry
    newEntries.push({
      id: generateId(),
      timestamp: now,
      type: 'command',
      content: command,
      exitCode,
    })

    // Stdout entry (only if non-empty)
    if (stdout.length > 0) {
      newEntries.push({
        id: generateId(),
        timestamp: now,
        type: 'stdout',
        content: stdout,
      })
    }

    // Stderr entry (only if non-empty)
    if (stderr.length > 0) {
      newEntries.push({
        id: generateId(),
        timestamp: now,
        type: 'stderr',
        content: stderr,
      })
    }

    const combined = [...this.entries, ...newEntries]
    return new ContextCollector(truncateEntries(combined), this.startTime)
  }

  /**
   * Record an AI response.
   * Returns a new ContextCollector — does not mutate.
   */
  addAIResponse(content: string, model: string): ContextCollector {
    const entry: ConsoleEntry = {
      id: generateId(),
      timestamp: Date.now(),
      type: 'ai_response',
      content,
      metadata: { model },
    }

    const combined = [...this.entries, entry]
    return new ContextCollector(truncateEntries(combined), this.startTime)
  }

  /**
   * Build a SessionContext snapshot from the current state.
   */
  getSessionContext(cwd: string, shell: string): SessionContext {
    // Count unique error events — a command with non-zero exit code is one error event.
    const commandErrorCount = this.entries.filter(
      (e) =>
        e.type === 'command' && e.exitCode !== undefined && e.exitCode !== 0,
    ).length

    return {
      cwd,
      shell,
      env: filterEnvVars(),
      recentEntries: this.entries,
      errorCount: commandErrorCount,
      sessionStartTime: this.startTime,
    }
  }

  /**
   * Build an AI system prompt incorporating the session context.
   * Truncates to MAX_SYSTEM_PROMPT_LENGTH if too large.
   */
  static buildSystemPrompt(context: SessionContext): string {
    const parts: string[] = []

    parts.push(
      'You are an AI assistant embedded in a terminal. Here is the user\'s recent session context:',
    )
    parts.push('')
    parts.push(`Working Directory: ${context.cwd}`)
    parts.push(`Shell: ${context.shell}`)
    parts.push('')

    // Recent commands section
    if (context.recentEntries.length > 0) {
      parts.push('Recent Commands:')

      for (const entry of context.recentEntries) {
        const ts = formatTimestamp(entry.timestamp)

        switch (entry.type) {
          case 'command':
            parts.push(`[${ts}] $ ${entry.content}`)
            if (entry.exitCode !== undefined && entry.exitCode !== 0) {
              parts.push(`[${ts}] Exit code: ${entry.exitCode}`)
            }
            break
          case 'stdout':
            // Trim long stdout to keep prompt manageable
            {
              const trimmed =
                entry.content.length > 200
                  ? `${entry.content.slice(0, 200)}... (truncated)`
                  : entry.content
              parts.push(`[${ts}] ${trimmed}`)
            }
            break
          case 'stderr':
            parts.push(`[${ts}] Error: ${entry.content}`)
            break
          case 'ai_response':
            parts.push(`[${ts}] AI: ${entry.content.slice(0, 100)}...`)
            break
          case 'user_message':
            parts.push(`[${ts}] User: ${entry.content}`)
            break
        }
      }

      parts.push('')
    }

    if (context.errorCount > 0) {
      parts.push(`Errors in session: ${context.errorCount}`)
      parts.push('')
    }

    parts.push(
      'Help the user troubleshoot their issue. Be concise and actionable.',
    )

    let prompt = parts.join('\n')

    // Truncate if too large
    if (prompt.length > MAX_SYSTEM_PROMPT_LENGTH) {
      prompt = `${prompt.slice(0, MAX_SYSTEM_PROMPT_LENGTH - 3)}...`
    }

    return prompt
  }

  /**
   * Reset — returns a new empty collector, preserving start time reset.
   */
  clear(): ContextCollector {
    return new ContextCollector([], Date.now())
  }
}
