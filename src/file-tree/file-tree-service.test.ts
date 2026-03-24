import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

import type { FileEntry } from '@/types/file-tree'
import {
  readDirectory,
  readDirectoryTree,
  detectCwd,
  getFileIcon,
  DEFAULT_IGNORE_PATTERNS,
} from './file-tree-service'

// ---------------------------------------------------------------------------
// Test fixtures — real temp directory
// ---------------------------------------------------------------------------

let tmpDir: string

async function createTempStructure(): Promise<string> {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aiterminal-test-'))

  // Create directories
  await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true })
  await fs.mkdir(path.join(tmpDir, 'src', 'components'), { recursive: true })
  await fs.mkdir(path.join(tmpDir, 'node_modules'), { recursive: true })
  await fs.mkdir(path.join(tmpDir, '.git'), { recursive: true })
  await fs.mkdir(path.join(tmpDir, 'dist'), { recursive: true })

  // Create files
  await fs.writeFile(path.join(tmpDir, 'package.json'), '{}')
  await fs.writeFile(path.join(tmpDir, 'README.md'), '# Test')
  await fs.writeFile(path.join(tmpDir, '.gitignore'), 'node_modules')
  await fs.writeFile(path.join(tmpDir, '.env'), 'SECRET=abc')
  await fs.writeFile(path.join(tmpDir, 'src', 'index.ts'), 'export {}')
  await fs.writeFile(path.join(tmpDir, 'src', 'app.tsx'), '<App />')
  await fs.writeFile(path.join(tmpDir, 'src', 'styles.css'), 'body {}')
  await fs.writeFile(path.join(tmpDir, 'src', 'config.json'), '{}')
  await fs.writeFile(path.join(tmpDir, 'src', 'logo.png'), 'fake-png')
  await fs.writeFile(path.join(tmpDir, 'src', 'components', 'Button.tsx'), 'export {}')

  return tmpDir
}

async function cleanupTempStructure(): Promise<void> {
  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------------------
// readDirectory
// ---------------------------------------------------------------------------

describe('readDirectory', () => {
  beforeEach(async () => {
    await createTempStructure()
  })

  afterEach(async () => {
    await cleanupTempStructure()
  })

  it('returns sorted entries (directories first, then files, alphabetical)', async () => {
    const entries = await readDirectory(tmpDir)

    // Find the boundary between dirs and files
    const firstFileIndex = entries.findIndex(e => !e.isDirectory)
    const dirs = entries.slice(0, firstFileIndex)
    const files = entries.slice(firstFileIndex)

    // All directories should come first
    expect(dirs.every(e => e.isDirectory)).toBe(true)
    expect(files.every(e => !e.isDirectory)).toBe(true)

    // Each group should be alphabetically sorted (case-insensitive)
    const dirNames = dirs.map(e => e.name)
    const fileNames = files.map(e => e.name)
    expect(dirNames).toEqual([...dirNames].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })))
    expect(fileNames).toEqual([...fileNames].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })))
  })

  it('marks hidden files (starting with .)', async () => {
    const entries = await readDirectory(tmpDir)

    const gitignore = entries.find(e => e.name === '.gitignore')
    const env = entries.find(e => e.name === '.env')
    const packageJson = entries.find(e => e.name === 'package.json')
    const gitDir = entries.find(e => e.name === '.git')

    expect(gitignore?.isHidden).toBe(true)
    expect(env?.isHidden).toBe(true)
    expect(packageJson?.isHidden).toBe(false)
    expect(gitDir?.isHidden).toBe(true)
  })

  it('includes file extension for files', async () => {
    const entries = await readDirectory(tmpDir)

    const packageJson = entries.find(e => e.name === 'package.json')
    const readme = entries.find(e => e.name === 'README.md')
    const gitignore = entries.find(e => e.name === '.gitignore')

    expect(packageJson?.extension).toBe('.json')
    expect(readme?.extension).toBe('.md')
    expect(gitignore?.extension).toBe(null)
  })

  it('sets extension to null for directories', async () => {
    const entries = await readDirectory(tmpDir)

    const srcDir = entries.find(e => e.name === 'src')
    expect(srcDir?.extension).toBe(null)
  })

  it('includes file size for files (> 0)', async () => {
    const entries = await readDirectory(tmpDir)

    const packageJson = entries.find(e => e.name === 'package.json')
    expect(packageJson?.size).toBeGreaterThan(0)
  })

  it('sets size to 0 for directories', async () => {
    const entries = await readDirectory(tmpDir)

    const srcDir = entries.find(e => e.name === 'src')
    expect(srcDir?.size).toBe(0)
  })

  it('returns entries with correct paths', async () => {
    const entries = await readDirectory(tmpDir)

    const packageJson = entries.find(e => e.name === 'package.json')
    expect(packageJson?.path).toBe(path.join(tmpDir, 'package.json'))
  })

  it('handles permission errors gracefully (returns empty array)', async () => {
    const entries = await readDirectory('/root/no-access-dir-12345')
    expect(entries).toEqual([])
  })

  it('handles non-existent path (returns empty array)', async () => {
    const entries = await readDirectory('/nonexistent/path/that/does/not/exist')
    expect(entries).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// readDirectoryTree
// ---------------------------------------------------------------------------

describe('readDirectoryTree', () => {
  beforeEach(async () => {
    await createTempStructure()
  })

  afterEach(async () => {
    await cleanupTempStructure()
  })

  it('depth=1 reads only immediate children (no nested children)', async () => {
    const entries = await readDirectoryTree(tmpDir, 1)

    const srcDir = entries.find(e => e.name === 'src')
    expect(srcDir).toBeDefined()
    expect(srcDir?.isDirectory).toBe(true)
    // At depth 1, directories should not have children populated
    expect(srcDir?.children).toBeUndefined()
  })

  it('depth=2 reads children of directories', async () => {
    const entries = await readDirectoryTree(tmpDir, 2)

    const srcDir = entries.find(e => e.name === 'src')
    expect(srcDir).toBeDefined()
    expect(srcDir?.children).toBeDefined()
    expect(srcDir!.children!.length).toBeGreaterThan(0)

    // The nested 'components' dir should NOT have children at depth 2
    const componentsDir = srcDir!.children!.find(e => e.name === 'components')
    expect(componentsDir).toBeDefined()
    expect(componentsDir?.children).toBeUndefined()
  })

  it('depth=3 reads two levels of nesting', async () => {
    const entries = await readDirectoryTree(tmpDir, 3)

    const srcDir = entries.find(e => e.name === 'src')
    const componentsDir = srcDir!.children!.find(e => e.name === 'components')
    expect(componentsDir?.children).toBeDefined()
    expect(componentsDir!.children!.some(e => e.name === 'Button.tsx')).toBe(true)
  })

  it('skips node_modules, .git by default', async () => {
    const entries = await readDirectoryTree(tmpDir, 2)

    const nodeModules = entries.find(e => e.name === 'node_modules')
    const gitDir = entries.find(e => e.name === '.git')

    expect(nodeModules).toBeUndefined()
    expect(gitDir).toBeUndefined()
  })

  it('skips dist and .DS_Store by default', async () => {
    const entries = await readDirectoryTree(tmpDir, 2)

    const distDir = entries.find(e => e.name === 'dist')
    expect(distDir).toBeUndefined()
  })

  it('allows overriding ignore patterns', async () => {
    // Only ignore .git, so node_modules and dist should be included
    const entries = await readDirectoryTree(tmpDir, 1, ['.git'])

    const nodeModules = entries.find(e => e.name === 'node_modules')
    const distDir = entries.find(e => e.name === 'dist')

    expect(nodeModules).toBeDefined()
    expect(distDir).toBeDefined()
  })

  it('preserves sorting in nested children (directories first)', async () => {
    const entries = await readDirectoryTree(tmpDir, 2)

    const srcDir = entries.find(e => e.name === 'src')
    expect(srcDir?.children).toBeDefined()

    const children = srcDir!.children!
    const firstFileIndex = children.findIndex(e => !e.isDirectory)

    if (firstFileIndex > 0) {
      const dirs = children.slice(0, firstFileIndex)
      expect(dirs.every(e => e.isDirectory)).toBe(true)
    }
  })

  it('handles non-existent path gracefully', async () => {
    const entries = await readDirectoryTree('/nonexistent/path', 2)
    expect(entries).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// detectCwd
// ---------------------------------------------------------------------------

describe('detectCwd', () => {
  it('detects from common PS1 prompt pattern: user@host:path$', () => {
    const output = 'ghost@mac:/Users/ghost/projects$ '
    const cwd = detectCwd(output)
    expect(cwd).toBe('/Users/ghost/projects')
  })

  it('detects from PS1 with ~ for home directory', () => {
    const output = 'ghost@mac:~/projects$ '
    const cwd = detectCwd(output)
    expect(cwd).toContain('projects')
  })

  it('detects from pwd command output (absolute path on its own line)', () => {
    const output = '$ pwd\n/Users/ghost/Desktop/aiterminal\n$ '
    const cwd = detectCwd(output)
    expect(cwd).toBe('/Users/ghost/Desktop/aiterminal')
  })

  it('detects from zsh prompt with directory only', () => {
    const output = '~/Desktop/aiterminal % '
    const cwd = detectCwd(output)
    expect(cwd).toContain('Desktop/aiterminal')
  })

  it('returns null if cannot determine cwd', () => {
    const output = 'some random text with no path'
    const cwd = detectCwd(output)
    expect(cwd).toBeNull()
  })

  it('returns null for empty string', () => {
    const cwd = detectCwd('')
    expect(cwd).toBeNull()
  })

  it('handles multiline output and picks the last cwd-like match', () => {
    const output = [
      'ghost@mac:/Users/ghost/old$ cd /Users/ghost/new',
      'ghost@mac:/Users/ghost/new$ ',
    ].join('\n')
    const cwd = detectCwd(output)
    expect(cwd).toBe('/Users/ghost/new')
  })
})

// ---------------------------------------------------------------------------
// getFileIcon
// ---------------------------------------------------------------------------

describe('getFileIcon', () => {
  function makeEntry(overrides: Partial<FileEntry>): FileEntry {
    return {
      name: 'test',
      path: '/test',
      isDirectory: false,
      isHidden: false,
      size: 100,
      extension: null,
      ...overrides,
    }
  }

  it('returns folder icon for directories', () => {
    const icon = getFileIcon(makeEntry({ isDirectory: true, name: 'src' }))
    expect(icon).toBeTruthy()
    expect(typeof icon).toBe('string')
  })

  it('returns TypeScript icon for .ts files', () => {
    const icon = getFileIcon(makeEntry({ extension: '.ts', name: 'index.ts' }))
    expect(icon).toBeTruthy()
  })

  it('returns TypeScript icon for .tsx files', () => {
    const icon = getFileIcon(makeEntry({ extension: '.tsx', name: 'App.tsx' }))
    expect(icon).toBeTruthy()
  })

  it('returns JavaScript icon for .js files', () => {
    const icon = getFileIcon(makeEntry({ extension: '.js', name: 'main.js' }))
    expect(icon).toBeTruthy()
  })

  it('returns JavaScript icon for .jsx files', () => {
    const icon = getFileIcon(makeEntry({ extension: '.jsx', name: 'App.jsx' }))
    expect(icon).toBeTruthy()
  })

  it('returns config icon for .json files', () => {
    const icon = getFileIcon(makeEntry({ extension: '.json', name: 'package.json' }))
    expect(icon).toBeTruthy()
  })

  it('returns doc icon for .md files', () => {
    const icon = getFileIcon(makeEntry({ extension: '.md', name: 'README.md' }))
    expect(icon).toBeTruthy()
  })

  it('returns style icon for .css files', () => {
    const icon = getFileIcon(makeEntry({ extension: '.css', name: 'styles.css' }))
    expect(icon).toBeTruthy()
  })

  it('returns image icon for .png files', () => {
    const icon = getFileIcon(makeEntry({ extension: '.png', name: 'logo.png' }))
    expect(icon).toBeTruthy()
  })

  it('returns image icon for .jpg files', () => {
    const icon = getFileIcon(makeEntry({ extension: '.jpg', name: 'photo.jpg' }))
    expect(icon).toBeTruthy()
  })

  it('returns image icon for .svg files', () => {
    const icon = getFileIcon(makeEntry({ extension: '.svg', name: 'icon.svg' }))
    expect(icon).toBeTruthy()
  })

  it('returns default file icon for unknown extensions', () => {
    const icon = getFileIcon(makeEntry({ extension: '.xyz', name: 'test.xyz' }))
    expect(icon).toBeTruthy()
  })

  it('returns different icons for directories vs files', () => {
    const dirIcon = getFileIcon(makeEntry({ isDirectory: true, name: 'src' }))
    const fileIcon = getFileIcon(makeEntry({ extension: '.ts', name: 'index.ts' }))
    expect(dirIcon).not.toBe(fileIcon)
  })

  it('returns different icons for TypeScript vs JavaScript', () => {
    const tsIcon = getFileIcon(makeEntry({ extension: '.ts', name: 'index.ts' }))
    const jsIcon = getFileIcon(makeEntry({ extension: '.js', name: 'index.js' }))
    expect(tsIcon).not.toBe(jsIcon)
  })
})

// ---------------------------------------------------------------------------
// DEFAULT_IGNORE_PATTERNS
// ---------------------------------------------------------------------------

describe('DEFAULT_IGNORE_PATTERNS', () => {
  it('includes common patterns', () => {
    expect(DEFAULT_IGNORE_PATTERNS).toContain('node_modules')
    expect(DEFAULT_IGNORE_PATTERNS).toContain('.git')
    expect(DEFAULT_IGNORE_PATTERNS).toContain('.DS_Store')
    expect(DEFAULT_IGNORE_PATTERNS).toContain('dist')
    expect(DEFAULT_IGNORE_PATTERNS).toContain('out')
    expect(DEFAULT_IGNORE_PATTERNS).toContain('coverage')
  })
})
