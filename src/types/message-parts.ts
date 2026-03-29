/**
 * Parts-based message model — opencode-inspired.
 * Messages are composed of typed parts instead of monolithic strings.
 */

export type MessagePart =
  | TextPart
  | ToolCallPart
  | FilePart
  | DiffPart

export interface TextPart {
  readonly type: 'text'
  readonly content: string
}

export interface ToolCallPart {
  readonly type: 'tool'
  readonly tool: 'read' | 'write' | 'edit' | 'run' | 'delete'
  readonly path?: string
  readonly command?: string
  readonly status: 'pending' | 'running' | 'done' | 'error'
  readonly summary?: string
  readonly output?: string
  readonly error?: string
}

export interface FilePart {
  readonly type: 'file'
  readonly path: string
  readonly lines: number
  readonly size: number
}

export interface DiffPart {
  readonly type: 'diff'
  readonly path: string
  readonly removed: readonly string[]
  readonly added: readonly string[]
}

/**
 * Parse a monolithic message string into typed parts.
 * This is the bridge between the current string-based system and the new parts model.
 */
export function parseMessageIntoParts(content: string): readonly MessagePart[] {
  const parts: MessagePart[] = []
  let remaining = content

  // Extract tool indicators in order of appearance
  const patterns: Array<{
    regex: RegExp
    handler: (match: RegExpMatchArray) => MessagePart | null
  }> = [
    {
      regex: /⚡ Executed: `([^`]+)`/,
      handler: (m) => ({ type: 'tool', tool: 'run', command: m[1], status: 'done' as const }),
    },
    {
      regex: /📄 Read \*\*([^*]+)\*\* — (\d+) lines, (\d+)KB/,
      handler: (m) => ({ type: 'file', path: m[1], lines: parseInt(m[2]), size: parseInt(m[3]) * 1024 }),
    },
    {
      regex: /✅ \*\*([^*]+)\*\*\n```diff\n([\s\S]*?)```/,
      handler: (m) => {
        const lines = m[2].split('\n')
        return {
          type: 'diff',
          path: m[1],
          removed: lines.filter(l => l.startsWith('- ')).map(l => l.slice(2)),
          added: lines.filter(l => l.startsWith('+ ')).map(l => l.slice(2)),
        }
      },
    },
    {
      regex: /❌ (\w+) ([^:]+): (.+)/,
      handler: (m) => ({
        type: 'tool',
        tool: m[1] as ToolCallPart['tool'],
        path: m[2],
        status: 'error' as const,
        error: m[3],
      }),
    },
  ]

  // Process patterns in order of position in the text
  while (remaining.length > 0) {
    let earliestMatch: { index: number; match: RegExpMatchArray; handler: typeof patterns[0]['handler'] } | null = null

    for (const { regex, handler } of patterns) {
      const match = remaining.match(regex)
      if (match && match.index !== undefined) {
        if (!earliestMatch || match.index < earliestMatch.index) {
          earliestMatch = { index: match.index, match, handler }
        }
      }
    }

    if (!earliestMatch) {
      // No more patterns — rest is text
      const trimmed = remaining.trim()
      if (trimmed.length > 0) {
        parts.push({ type: 'text', content: trimmed })
      }
      break
    }

    // Text before the match
    const before = remaining.slice(0, earliestMatch.index).trim()
    if (before.length > 0) {
      parts.push({ type: 'text', content: before })
    }

    // The matched part
    const part = earliestMatch.handler(earliestMatch.match)
    if (part) {
      parts.push(part)
    }

    // Continue after the match
    remaining = remaining.slice(earliestMatch.index + earliestMatch.match[0].length)
  }

  return parts
}
