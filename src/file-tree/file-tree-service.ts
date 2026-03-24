import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

import type { FileEntry } from '@/types/file-tree'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_IGNORE_PATTERNS: ReadonlyArray<string> = [
  'node_modules',
  '.git',
  '.DS_Store',
  'dist',
  'out',
  'coverage',
]

// ---------------------------------------------------------------------------
// File icon mapping
// ---------------------------------------------------------------------------

const ICON_DIRECTORY = '\u{1F4C1}' // folder
const ICON_TYPESCRIPT = '\u{1F518}' // blue circle (TS)
const ICON_JAVASCRIPT = '\u{1F7E1}' // yellow circle (JS)
const ICON_JSON = '\u{2699}\uFE0F'  // gear (config)
const ICON_MARKDOWN = '\u{1F4DD}'   // memo (doc)
const ICON_CSS = '\u{1F3A8}'        // palette (style)
const ICON_IMAGE = '\u{1F5BC}\uFE0F' // framed picture
const ICON_FILE = '\u{1F4C4}'       // page facing up (default)

const EXTENSION_ICON_MAP: Readonly<Record<string, string>> = {
  '.ts': ICON_TYPESCRIPT,
  '.tsx': ICON_TYPESCRIPT,
  '.js': ICON_JAVASCRIPT,
  '.jsx': ICON_JAVASCRIPT,
  '.mjs': ICON_JAVASCRIPT,
  '.cjs': ICON_JAVASCRIPT,
  '.json': ICON_JSON,
  '.md': ICON_MARKDOWN,
  '.mdx': ICON_MARKDOWN,
  '.css': ICON_CSS,
  '.scss': ICON_CSS,
  '.less': ICON_CSS,
  '.png': ICON_IMAGE,
  '.jpg': ICON_IMAGE,
  '.jpeg': ICON_IMAGE,
  '.gif': ICON_IMAGE,
  '.svg': ICON_IMAGE,
  '.webp': ICON_IMAGE,
  '.ico': ICON_IMAGE,
}

// ---------------------------------------------------------------------------
// getFileIcon
// ---------------------------------------------------------------------------

export function getFileIcon(entry: FileEntry): string {
  if (entry.isDirectory) {
    return ICON_DIRECTORY
  }

  if (entry.extension !== null) {
    const icon = EXTENSION_ICON_MAP[entry.extension.toLowerCase()]
    if (icon) {
      return icon
    }
  }

  return ICON_FILE
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the "display" extension from a filename.
 * Returns null for directories or dotfiles with no secondary extension (e.g. ".gitignore").
 */
function getExtension(name: string, isDirectory: boolean): string | null {
  if (isDirectory) {
    return null
  }

  const ext = path.extname(name)

  // path.extname('.gitignore') returns '' — treat as null
  if (ext === '' || ext === name) {
    return null
  }

  return ext
}

/**
 * Sort entries: directories first (alphabetical), then files (alphabetical).
 * Sorting is case-insensitive.
 */
function sortEntries(entries: ReadonlyArray<FileEntry>): ReadonlyArray<FileEntry> {
  return [...entries].sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1
    if (!a.isDirectory && b.isDirectory) return 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
}

// ---------------------------------------------------------------------------
// readDirectory
// ---------------------------------------------------------------------------

export async function readDirectory(dirPath: string): Promise<ReadonlyArray<FileEntry>> {
  try {
    const dirents = await fs.readdir(dirPath, { withFileTypes: true })

    const entries: FileEntry[] = await Promise.all(
      dirents.map(async (dirent): Promise<FileEntry> => {
        const fullPath = path.join(dirPath, dirent.name)
        const isDir = dirent.isDirectory()
        let size = 0

        if (!isDir) {
          try {
            const stat = await fs.stat(fullPath)
            size = stat.size
          } catch {
            // If we can't stat the file, leave size as 0
          }
        }

        return {
          name: dirent.name,
          path: fullPath,
          isDirectory: isDir,
          isHidden: dirent.name.startsWith('.'),
          size,
          extension: getExtension(dirent.name, isDir),
        }
      }),
    )

    return sortEntries(entries)
  } catch {
    // Permission error, non-existent path, etc.
    return []
  }
}

// ---------------------------------------------------------------------------
// readDirectoryTree
// ---------------------------------------------------------------------------

export async function readDirectoryTree(
  dirPath: string,
  depth: number = 2,
  ignorePatterns: ReadonlyArray<string> = DEFAULT_IGNORE_PATTERNS,
): Promise<ReadonlyArray<FileEntry>> {
  try {
    const dirents = await fs.readdir(dirPath, { withFileTypes: true })

    const filteredDirents = dirents.filter(
      dirent => !ignorePatterns.includes(dirent.name),
    )

    const entries: FileEntry[] = await Promise.all(
      filteredDirents.map(async (dirent): Promise<FileEntry> => {
        const fullPath = path.join(dirPath, dirent.name)
        const isDir = dirent.isDirectory()
        let size = 0
        let children: ReadonlyArray<FileEntry> | undefined

        if (!isDir) {
          try {
            const stat = await fs.stat(fullPath)
            size = stat.size
          } catch {
            // Leave size as 0
          }
        }

        // Recurse into directories if we have depth remaining
        if (isDir && depth > 1) {
          children = await readDirectoryTree(fullPath, depth - 1, ignorePatterns)
        }

        return {
          name: dirent.name,
          path: fullPath,
          isDirectory: isDir,
          isHidden: dirent.name.startsWith('.'),
          size,
          extension: getExtension(dirent.name, isDir),
          ...(children !== undefined ? { children } : {}),
        }
      }),
    )

    return sortEntries(entries)
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// detectCwd
// ---------------------------------------------------------------------------

/**
 * Attempts to extract the current working directory from shell output.
 * Uses several regex patterns to match common prompt formats and pwd output.
 */
export function detectCwd(output: string): string | null {
  if (output.length === 0) {
    return null
  }

  const lines = output.split('\n')

  // Strategy: try several patterns and take the last match (most recent prompt)
  let lastMatch: string | null = null

  for (const line of lines) {
    const trimmed = line.trim()

    // Pattern 1: user@host:/path/to/dir$
    const hostPathMatch = trimmed.match(/\w+@[\w.-]+:([^\s$]+)\$?\s*$/)
    if (hostPathMatch) {
      const matched = hostPathMatch[1]
      lastMatch = expandTilde(matched)
      continue
    }

    // Pattern 2: ~/path/to/dir % (zsh default)
    const zshMatch = trimmed.match(/^(~[^\s]*)\s*%\s*$/)
    if (zshMatch) {
      lastMatch = expandTilde(zshMatch[1])
      continue
    }

    // Pattern 3: Absolute path on its own line (pwd output)
    const pwdMatch = trimmed.match(/^(\/[\w./-]+)$/)
    if (pwdMatch) {
      lastMatch = pwdMatch[1]
      continue
    }
  }

  return lastMatch
}

/**
 * Expand ~ to the user's home directory.
 */
function expandTilde(p: string): string {
  if (p.startsWith('~')) {
    return path.join(os.homedir(), p.slice(1))
  }
  return p
}
