import type { SyntaxToken } from '@/types/file-preview'

// ---------------------------------------------------------------------------
// Language detection
// ---------------------------------------------------------------------------

const EXTENSION_LANGUAGE_MAP: Readonly<Record<string, string>> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.json': 'json',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.md': 'markdown',
  '.mdx': 'markdown',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.html': 'html',
  '.htm': 'html',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.toml': 'toml',
  '.sql': 'sql',
  '.java': 'java',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
}

/**
 * Detect the language from a filename's extension.
 * Returns 'plain' for unknown/missing extensions.
 */
export function detectLanguage(filename: string): string {
  const dotIndex = filename.lastIndexOf('.')
  if (dotIndex === -1 || dotIndex === 0) {
    return 'plain'
  }

  const ext = filename.slice(dotIndex).toLowerCase()
  return EXTENSION_LANGUAGE_MAP[ext] ?? 'plain'
}

// ---------------------------------------------------------------------------
// Token rules per language family
// ---------------------------------------------------------------------------

interface TokenRule {
  readonly type: SyntaxToken['type']
  readonly pattern: RegExp
}

const JS_TS_KEYWORDS = [
  'abstract', 'as', 'async', 'await', 'break', 'case', 'catch', 'class',
  'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else',
  'enum', 'export', 'extends', 'false', 'finally', 'for', 'from',
  'function', 'if', 'implements', 'import', 'in', 'instanceof', 'interface',
  'let', 'new', 'null', 'of', 'package', 'private', 'protected', 'public',
  'readonly', 'return', 'static', 'super', 'switch', 'this', 'throw',
  'true', 'try', 'type', 'typeof', 'undefined', 'var', 'void', 'while',
  'with', 'yield',
]

const PYTHON_KEYWORDS = [
  'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue',
  'def', 'del', 'elif', 'else', 'except', 'False', 'finally', 'for',
  'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'None',
  'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'True', 'try',
  'while', 'with', 'yield',
]

const GO_KEYWORDS = [
  'break', 'case', 'chan', 'const', 'continue', 'default', 'defer',
  'else', 'fallthrough', 'for', 'func', 'go', 'goto', 'if', 'import',
  'interface', 'map', 'package', 'range', 'return', 'select', 'struct',
  'switch', 'type', 'var', 'true', 'false', 'nil',
]

const RUST_KEYWORDS = [
  'as', 'async', 'await', 'break', 'const', 'continue', 'crate', 'dyn',
  'else', 'enum', 'extern', 'false', 'fn', 'for', 'if', 'impl', 'in',
  'let', 'loop', 'match', 'mod', 'move', 'mut', 'pub', 'ref', 'return',
  'self', 'Self', 'static', 'struct', 'super', 'trait', 'true', 'type',
  'unsafe', 'use', 'where', 'while',
]

const CSS_KEYWORDS = [
  'inherit', 'initial', 'unset', 'none', 'auto', 'block', 'flex', 'grid',
  'inline', 'relative', 'absolute', 'fixed', 'sticky', 'hidden', 'visible',
  'solid', 'dashed', 'dotted', 'important',
]

const BASH_KEYWORDS = [
  'if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'do', 'done',
  'case', 'esac', 'function', 'return', 'exit', 'export', 'local',
  'readonly', 'shift', 'unset', 'echo', 'true', 'false',
]

function buildKeywordPattern(keywords: ReadonlyArray<string>): RegExp {
  return new RegExp(`\\b(?:${keywords.join('|')})\\b`)
}

function buildRulesForLanguage(language: string): ReadonlyArray<TokenRule> {
  switch (language) {
    case 'typescript':
    case 'tsx':
    case 'javascript':
    case 'jsx': {
      return [
        { type: 'comment', pattern: /\/\/.*$/ },
        { type: 'comment', pattern: /\/\*[\s\S]*?\*\// },
        { type: 'string', pattern: /`(?:\\[\s\S]|[^`])*`/ },
        { type: 'string', pattern: /"(?:\\[\s\S]|[^"\\])*"/ },
        { type: 'string', pattern: /'(?:\\[\s\S]|[^'\\])*'/ },
        { type: 'number', pattern: /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/ },
        { type: 'keyword', pattern: buildKeywordPattern(JS_TS_KEYWORDS) },
        { type: 'operator', pattern: /[+\-*/%=!<>&|^~?:]+/ },
      ]
    }

    case 'python': {
      return [
        { type: 'comment', pattern: /#.*$/ },
        { type: 'string', pattern: /"""[\s\S]*?"""/ },
        { type: 'string', pattern: /'''[\s\S]*?'''/ },
        { type: 'string', pattern: /"(?:\\[\s\S]|[^"\\])*"/ },
        { type: 'string', pattern: /'(?:\\[\s\S]|[^'\\])*'/ },
        { type: 'number', pattern: /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/ },
        { type: 'keyword', pattern: buildKeywordPattern(PYTHON_KEYWORDS) },
        { type: 'operator', pattern: /[+\-*/%=!<>&|^~@:]+/ },
      ]
    }

    case 'go': {
      return [
        { type: 'comment', pattern: /\/\/.*$/ },
        { type: 'comment', pattern: /\/\*[\s\S]*?\*\// },
        { type: 'string', pattern: /`[^`]*`/ },
        { type: 'string', pattern: /"(?:\\[\s\S]|[^"\\])*"/ },
        { type: 'number', pattern: /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/ },
        { type: 'keyword', pattern: buildKeywordPattern(GO_KEYWORDS) },
        { type: 'operator', pattern: /[+\-*/%=!<>&|^~?:]+/ },
      ]
    }

    case 'rust': {
      return [
        { type: 'comment', pattern: /\/\/.*$/ },
        { type: 'comment', pattern: /\/\*[\s\S]*?\*\// },
        { type: 'string', pattern: /"(?:\\[\s\S]|[^"\\])*"/ },
        { type: 'number', pattern: /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?(?:_\d+)*\b/ },
        { type: 'keyword', pattern: buildKeywordPattern(RUST_KEYWORDS) },
        { type: 'operator', pattern: /[+\-*/%=!<>&|^~?:]+/ },
      ]
    }

    case 'json': {
      return [
        { type: 'string', pattern: /"(?:\\[\s\S]|[^"\\])*"/ },
        { type: 'number', pattern: /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/ },
        { type: 'keyword', pattern: /\b(?:true|false|null)\b/ },
        { type: 'operator', pattern: /[{}[\]:,]/ },
      ]
    }

    case 'css':
    case 'scss':
    case 'less': {
      return [
        { type: 'comment', pattern: /\/\*[\s\S]*?\*\// },
        { type: 'string', pattern: /"(?:\\[\s\S]|[^"\\])*"/ },
        { type: 'string', pattern: /'(?:\\[\s\S]|[^'\\])*'/ },
        { type: 'number', pattern: /-?\b\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|s|ms)?\b/ },
        { type: 'keyword', pattern: buildKeywordPattern(CSS_KEYWORDS) },
        { type: 'operator', pattern: /[{}:;,>+~]/ },
      ]
    }

    case 'bash': {
      return [
        { type: 'comment', pattern: /#.*$/ },
        { type: 'string', pattern: /"(?:\\[\s\S]|[^"\\])*"/ },
        { type: 'string', pattern: /'[^']*'/ },
        { type: 'number', pattern: /\b\d+\b/ },
        { type: 'keyword', pattern: buildKeywordPattern(BASH_KEYWORDS) },
        { type: 'operator', pattern: /[|&;><]+/ },
      ]
    }

    case 'markdown': {
      return [
        { type: 'keyword', pattern: /^#{1,6}\s/ },
        { type: 'string', pattern: /`[^`]+`/ },
        { type: 'comment', pattern: /<!--[\s\S]*?-->/ },
        { type: 'operator', pattern: /^[-*+]\s/ },
      ]
    }

    case 'html': {
      return [
        { type: 'comment', pattern: /<!--[\s\S]*?-->/ },
        { type: 'string', pattern: /"(?:\\[\s\S]|[^"\\])*"/ },
        { type: 'string', pattern: /'(?:\\[\s\S]|[^'\\])*'/ },
        { type: 'keyword', pattern: /<\/?[a-zA-Z][a-zA-Z0-9]*/ },
        { type: 'operator', pattern: /[<>/=]/ },
      ]
    }

    default:
      return []
  }
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

/**
 * Tokenize a string of content for a given language.
 * Returns an array of SyntaxTokens whose values, when concatenated,
 * reconstruct the original input exactly.
 */
export function tokenize(content: string, language: string): ReadonlyArray<SyntaxToken> {
  if (language === 'plain' || content.length === 0) {
    return [{ type: 'plain', value: content }]
  }

  const rules = buildRulesForLanguage(language)
  if (rules.length === 0) {
    return [{ type: 'plain', value: content }]
  }

  const tokens: SyntaxToken[] = []
  let remaining = content
  let pos = 0

  while (remaining.length > 0) {
    let earliestMatch: { index: number; length: number; type: SyntaxToken['type'] } | null = null

    for (const rule of rules) {
      // Reset regex and search from the start of remaining
      const match = remaining.match(rule.pattern)
      if (match !== null && match.index !== undefined) {
        if (earliestMatch === null || match.index < earliestMatch.index) {
          earliestMatch = {
            index: match.index,
            length: match[0].length,
            type: rule.type,
          }
        }
      }
    }

    if (earliestMatch === null) {
      // No more matches — rest is plain text
      tokens.push({ type: 'plain', value: remaining })
      break
    }

    // Push plain text before the match
    if (earliestMatch.index > 0) {
      tokens.push({ type: 'plain', value: remaining.slice(0, earliestMatch.index) })
    }

    // Push the matched token
    tokens.push({
      type: earliestMatch.type,
      value: remaining.slice(earliestMatch.index, earliestMatch.index + earliestMatch.length),
    })

    // Advance past the match
    remaining = remaining.slice(earliestMatch.index + earliestMatch.length)
    pos += earliestMatch.index + earliestMatch.length
  }

  return tokens
}

// ---------------------------------------------------------------------------
// highlightLine
// ---------------------------------------------------------------------------

/**
 * Convenience wrapper: tokenize a single line.
 * Returns at least one token (plain empty string for blank lines).
 */
export function highlightLine(line: string, language: string): ReadonlyArray<SyntaxToken> {
  if (line.length === 0) {
    return [{ type: 'plain', value: '' }]
  }

  return tokenize(line, language)
}
