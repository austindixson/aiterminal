/**
 * Parse a monolithic AI response string into typed message parts.
 *
 * Replaces the old regex-based parseMessageIntoParts() with a structured
 * parser that handles:
 * - [TOOL:name key="value"] tags (new format)
 * - <thinking>...</thinking> blocks (reasoning)
 * - Legacy emoji format (⚡, 📄, ✅, ❌) for backwards compat
 * - Plain text (everything else)
 */

export interface TextPartV2 {
  readonly type: 'text'
  readonly content: string
}

export interface ToolPartV2 {
  readonly type: 'tool'
  readonly tool: string
  readonly status: 'pending' | 'running' | 'done' | 'error'
  readonly path?: string
  readonly command?: string
  readonly output?: string
  readonly error?: string
}

export interface ReasoningPartV2 {
  readonly type: 'reasoning'
  readonly content: string
}

export type MessagePartV2 = TextPartV2 | ToolPartV2 | ReasoningPartV2

// Pattern: [TOOL:name key="value" key2="value2"]
const TOOL_TAG_RE = /\[TOOL:(\w+)\s*((?:\w+="[^"]*"\s*)*)\]/g

// Pattern: <thinking>content</thinking> or <think>content</think> (QWen3 Coder)
const THINKING_RE = /<(?:thinking|think)>([\s\S]*?)<\/(?:thinking|think)>/g

// Legacy emoji patterns
const LEGACY_EXEC_RE = /⚡ Executed: `([^`]+)`/g
const LEGACY_READ_RE = /📄 Read \*\*([^*]+)\*\*/g
const LEGACY_WRITE_RE = /✅ \*\*([^*]+)\*\*/g
const LEGACY_ERROR_RE = /❌ (\w+) ([^:]+): (.+)/g

interface MatchInfo {
  readonly index: number
  readonly length: number
  readonly part: MessagePartV2
}

function parseToolAttrs(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const attrRe = /(\w+)="([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = attrRe.exec(attrStr)) !== null) {
    attrs[m[1]] = m[2]
  }
  return attrs
}

function findAllMatches(content: string): readonly MatchInfo[] {
  const matches: MatchInfo[] = []

  // Tool tags
  let m: RegExpExecArray | null
  TOOL_TAG_RE.lastIndex = 0
  while ((m = TOOL_TAG_RE.exec(content)) !== null) {
    const attrs = parseToolAttrs(m[2])
    matches.push({
      index: m.index,
      length: m[0].length,
      part: {
        type: 'tool',
        tool: m[1],
        status: 'done',
        path: attrs.path,
        command: attrs.command,
        output: attrs.output,
        error: attrs.error,
      },
    })
  }

  // Thinking blocks
  THINKING_RE.lastIndex = 0
  while ((m = THINKING_RE.exec(content)) !== null) {
    matches.push({
      index: m.index,
      length: m[0].length,
      part: { type: 'reasoning', content: m[1].trim() },
    })
  }

  // Legacy: executed commands
  LEGACY_EXEC_RE.lastIndex = 0
  while ((m = LEGACY_EXEC_RE.exec(content)) !== null) {
    matches.push({
      index: m.index,
      length: m[0].length,
      part: { type: 'tool', tool: 'bash', status: 'done', command: m[1] },
    })
  }

  // Legacy: file reads
  LEGACY_READ_RE.lastIndex = 0
  while ((m = LEGACY_READ_RE.exec(content)) !== null) {
    matches.push({
      index: m.index,
      length: m[0].length,
      part: { type: 'tool', tool: 'read', status: 'done', path: m[1] },
    })
  }

  // Legacy: writes
  LEGACY_WRITE_RE.lastIndex = 0
  while ((m = LEGACY_WRITE_RE.exec(content)) !== null) {
    matches.push({
      index: m.index,
      length: m[0].length,
      part: { type: 'tool', tool: 'write', status: 'done', path: m[1] },
    })
  }

  // Legacy: errors
  LEGACY_ERROR_RE.lastIndex = 0
  while ((m = LEGACY_ERROR_RE.exec(content)) !== null) {
    const validTools = ['read', 'write', 'edit', 'run', 'delete', 'bash']
    const tool = validTools.includes(m[1]) ? m[1] : 'bash'
    matches.push({
      index: m.index,
      length: m[0].length,
      part: { type: 'tool', tool, status: 'error', path: m[2], error: m[3] },
    })
  }

  // Sort by position, deduplicate overlapping (prefer first match)
  matches.sort((a, b) => a.index - b.index)

  const deduped: MatchInfo[] = []
  let lastEnd = 0
  for (const match of matches) {
    if (match.index >= lastEnd) {
      deduped.push(match)
      lastEnd = match.index + match.length
    }
  }

  return deduped
}

export function parseIntoParts(content: string): readonly MessagePartV2[] {
  if (!content.trim()) return []

  const matches = findAllMatches(content)

  if (matches.length === 0) {
    return [{ type: 'text', content }]
  }

  const parts: MessagePartV2[] = []
  let cursor = 0

  for (const match of matches) {
    // Text before this match
    if (match.index > cursor) {
      const text = content.slice(cursor, match.index).trim()
      if (text) {
        parts.push({ type: 'text', content: text })
      }
    }

    parts.push(match.part)
    cursor = match.index + match.length
  }

  // Remaining text
  if (cursor < content.length) {
    const text = content.slice(cursor).trim()
    if (text) {
      parts.push({ type: 'text', content: text })
    }
  }

  return parts
}
