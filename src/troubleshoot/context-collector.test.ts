import { describe, it, expect, beforeEach } from 'vitest'
import { ContextCollector } from './context-collector'
// Types used indirectly via ContextCollector's return values

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_CWD = '/Users/ghost/project'
const TEST_SHELL = '/bin/zsh'

// ---------------------------------------------------------------------------
// ContextCollector
// ---------------------------------------------------------------------------

describe('ContextCollector', () => {
  let collector: ContextCollector

  beforeEach(() => {
    collector = ContextCollector.create()
  })

  // -------------------------------------------------------------------------
  // addCommand
  // -------------------------------------------------------------------------

  describe('addCommand', () => {
    it('records a command with timestamp', () => {
      const next = collector.addCommand('ls -la', 0, 'file1.txt\nfile2.txt', '')
      const context = next.getSessionContext(TEST_CWD, TEST_SHELL)

      const commandEntry = context.recentEntries.find(
        (e) => e.type === 'command' && e.content === 'ls -la',
      )
      expect(commandEntry).toBeDefined()
      expect(commandEntry!.timestamp).toBeGreaterThan(0)
    })

    it('stores stdout as a separate entry', () => {
      const next = collector.addCommand('echo hello', 0, 'hello\n', '')
      const context = next.getSessionContext(TEST_CWD, TEST_SHELL)

      const stdoutEntry = context.recentEntries.find(
        (e) => e.type === 'stdout' && e.content === 'hello\n',
      )
      expect(stdoutEntry).toBeDefined()
    })

    it('stores stderr as a separate entry', () => {
      const next = collector.addCommand('bad-cmd', 1, '', 'command not found')
      const context = next.getSessionContext(TEST_CWD, TEST_SHELL)

      const stderrEntry = context.recentEntries.find(
        (e) => e.type === 'stderr' && e.content === 'command not found',
      )
      expect(stderrEntry).toBeDefined()
    })

    it('records exit code on the command entry', () => {
      const next = collector.addCommand('failing-cmd', 127, '', 'not found')
      const context = next.getSessionContext(TEST_CWD, TEST_SHELL)

      const commandEntry = context.recentEntries.find(
        (e) => e.type === 'command',
      )
      expect(commandEntry!.exitCode).toBe(127)
    })

    it('keeps last 50 entries max (ring buffer behavior)', () => {
      let current = collector
      // Each addCommand creates up to 3 entries (command + stdout + stderr)
      // 20 commands with stdout = 40 entries, then 6 more = 52 total -> capped at 50
      for (let i = 0; i < 20; i++) {
        current = current.addCommand(`cmd-${i}`, 0, `output-${i}`, '')
      }
      // 20 commands * 2 entries each = 40 entries
      // Add 6 more commands with all three (command + stdout + stderr) = 18 entries
      for (let i = 20; i < 26; i++) {
        current = current.addCommand(`cmd-${i}`, 1, `output-${i}`, `error-${i}`)
      }

      const context = current.getSessionContext(TEST_CWD, TEST_SHELL)
      expect(context.recentEntries.length).toBeLessThanOrEqual(50)
    })

    it('does not mutate the original collector — returns new collector', () => {
      const next = collector.addCommand('ls', 0, 'files', '')
      const originalContext = collector.getSessionContext(TEST_CWD, TEST_SHELL)
      const nextContext = next.getSessionContext(TEST_CWD, TEST_SHELL)

      expect(originalContext.recentEntries.length).toBe(0)
      expect(nextContext.recentEntries.length).toBeGreaterThan(0)
    })

    it('does not create stdout entry when stdout is empty', () => {
      const next = collector.addCommand('true', 0, '', '')
      const context = next.getSessionContext(TEST_CWD, TEST_SHELL)

      const stdoutEntries = context.recentEntries.filter(
        (e) => e.type === 'stdout',
      )
      expect(stdoutEntries.length).toBe(0)
    })

    it('does not create stderr entry when stderr is empty', () => {
      const next = collector.addCommand('ls', 0, 'output', '')
      const context = next.getSessionContext(TEST_CWD, TEST_SHELL)

      const stderrEntries = context.recentEntries.filter(
        (e) => e.type === 'stderr',
      )
      expect(stderrEntries.length).toBe(0)
    })
  })

  // -------------------------------------------------------------------------
  // addAIResponse
  // -------------------------------------------------------------------------

  describe('addAIResponse', () => {
    it('records an AI response with content', () => {
      const next = collector.addAIResponse(
        'Try running `npm install` first.',
        'claude-sonnet-4',
      )
      const context = next.getSessionContext(TEST_CWD, TEST_SHELL)

      const aiEntry = context.recentEntries.find(
        (e) => e.type === 'ai_response',
      )
      expect(aiEntry).toBeDefined()
      expect(aiEntry!.content).toBe('Try running `npm install` first.')
    })

    it('stores model name in metadata', () => {
      const next = collector.addAIResponse('Fix: use sudo', 'gpt-4')
      const context = next.getSessionContext(TEST_CWD, TEST_SHELL)

      const aiEntry = context.recentEntries.find(
        (e) => e.type === 'ai_response',
      )
      expect(aiEntry!.metadata).toBeDefined()
      expect(aiEntry!.metadata!.model).toBe('gpt-4')
    })

    it('does not mutate the original collector', () => {
      const next = collector.addAIResponse('response', 'model')
      const originalContext = collector.getSessionContext(TEST_CWD, TEST_SHELL)

      expect(originalContext.recentEntries.length).toBe(0)
      expect(
        next.getSessionContext(TEST_CWD, TEST_SHELL).recentEntries.length,
      ).toBe(1)
    })
  })

  // -------------------------------------------------------------------------
  // getSessionContext
  // -------------------------------------------------------------------------

  describe('getSessionContext', () => {
    it('returns cwd and shell', () => {
      const context = collector.getSessionContext(TEST_CWD, TEST_SHELL)

      expect(context.cwd).toBe(TEST_CWD)
      expect(context.shell).toBe(TEST_SHELL)
    })

    it('returns recent entries', () => {
      const next = collector
        .addCommand('ls', 0, 'file.txt', '')
        .addCommand('cat file.txt', 0, 'contents', '')

      const context = next.getSessionContext(TEST_CWD, TEST_SHELL)
      expect(context.recentEntries.length).toBeGreaterThan(0)
    })

    it('filters env vars — only safe vars, no secrets', () => {
      // The getSessionContext should filter environment variables
      // Only allowing: PATH, HOME, SHELL, TERM, LANG
      const context = collector.getSessionContext(TEST_CWD, TEST_SHELL)

      const envKeys = Object.keys(context.env)
      const forbiddenKeys = [
        'OPENROUTER_API_KEY',
        'AWS_SECRET_ACCESS_KEY',
        'DATABASE_URL',
        'GITHUB_TOKEN',
      ]

      for (const key of forbiddenKeys) {
        expect(envKeys).not.toContain(key)
      }
    })

    it('includes safe env vars when present in process.env', () => {
      const context = collector.getSessionContext(TEST_CWD, TEST_SHELL)

      // These safe vars should be allowed through the filter
      const safeVars = ['PATH', 'HOME', 'SHELL', 'TERM', 'LANG']
      for (const key of safeVars) {
        if (process.env[key]) {
          expect(context.env[key]).toBe(process.env[key])
        }
      }
    })

    it('error count matches entries with type stderr or non-zero exitCode', () => {
      const next = collector
        .addCommand('ok-cmd', 0, 'fine', '')
        .addCommand('bad-cmd', 1, '', 'error 1')
        .addCommand('worse-cmd', 2, '', 'error 2')
        .addCommand('good-cmd', 0, 'ok', '')

      const context = next.getSessionContext(TEST_CWD, TEST_SHELL)
      expect(context.errorCount).toBe(2)
    })

    it('returns session start time', () => {
      const beforeCreate = Date.now()
      const freshCollector = ContextCollector.create()
      const context = freshCollector.getSessionContext(TEST_CWD, TEST_SHELL)

      expect(context.sessionStartTime).toBeGreaterThanOrEqual(beforeCreate)
      expect(context.sessionStartTime).toBeLessThanOrEqual(Date.now())
    })
  })

  // -------------------------------------------------------------------------
  // buildSystemPrompt
  // -------------------------------------------------------------------------

  describe('buildSystemPrompt', () => {
    it('includes recent commands and their outputs', () => {
      const next = collector.addCommand('npm run build', 1, '', 'Module not found')
      const context = next.getSessionContext(TEST_CWD, TEST_SHELL)
      const prompt = ContextCollector.buildSystemPrompt(context)

      expect(prompt).toContain('npm run build')
      expect(prompt).toContain('Module not found')
    })

    it('includes error information', () => {
      const next = collector.addCommand('node app.js', 1, '', 'SyntaxError: Unexpected token')
      const context = next.getSessionContext(TEST_CWD, TEST_SHELL)
      const prompt = ContextCollector.buildSystemPrompt(context)

      expect(prompt).toContain('SyntaxError')
    })

    it('includes cwd and shell info', () => {
      const context = collector.getSessionContext(TEST_CWD, TEST_SHELL)
      const prompt = ContextCollector.buildSystemPrompt(context)

      expect(prompt).toContain(TEST_CWD)
      expect(prompt).toContain(TEST_SHELL)
    })

    it('formats as a readable context block', () => {
      const next = collector.addCommand('git status', 0, 'On branch main', '')
      const context = next.getSessionContext(TEST_CWD, TEST_SHELL)
      const prompt = ContextCollector.buildSystemPrompt(context)

      // Should contain structured sections
      expect(prompt).toContain('Working Directory')
      expect(prompt).toContain('Shell')
      expect(prompt).toContain('Recent Commands')
    })

    it('truncates if context too large (>4000 chars)', () => {
      let current = collector
      // Generate a lot of entries to exceed 4000 chars
      for (let i = 0; i < 30; i++) {
        current = current.addCommand(
          `long-command-with-lots-of-text-${i}`,
          0,
          'A'.repeat(200),
          '',
        )
      }
      const context = current.getSessionContext(TEST_CWD, TEST_SHELL)
      const prompt = ContextCollector.buildSystemPrompt(context)

      expect(prompt.length).toBeLessThanOrEqual(4000)
    })

    it('includes helpful instructions for the AI', () => {
      const context = collector.getSessionContext(TEST_CWD, TEST_SHELL)
      const prompt = ContextCollector.buildSystemPrompt(context)

      expect(prompt).toMatch(/troubleshoot|help|assist/i)
    })

    it('returns a valid prompt even with no entries', () => {
      const context = collector.getSessionContext(TEST_CWD, TEST_SHELL)
      const prompt = ContextCollector.buildSystemPrompt(context)

      expect(prompt.length).toBeGreaterThan(0)
      expect(prompt).toContain(TEST_CWD)
    })
  })

  // -------------------------------------------------------------------------
  // clear
  // -------------------------------------------------------------------------

  describe('clear', () => {
    it('resets state — returns empty collector', () => {
      const withData = collector
        .addCommand('ls', 0, 'files', '')
        .addAIResponse('response', 'model')

      const cleared = withData.clear()
      const context = cleared.getSessionContext(TEST_CWD, TEST_SHELL)

      expect(context.recentEntries.length).toBe(0)
    })

    it('does not mutate the original collector', () => {
      const withData = collector.addCommand('ls', 0, 'files', '')
      const cleared = withData.clear()

      const originalContext = withData.getSessionContext(TEST_CWD, TEST_SHELL)
      const clearedContext = cleared.getSessionContext(TEST_CWD, TEST_SHELL)

      expect(originalContext.recentEntries.length).toBeGreaterThan(0)
      expect(clearedContext.recentEntries.length).toBe(0)
    })
  })

  // -------------------------------------------------------------------------
  // Entry IDs
  // -------------------------------------------------------------------------

  describe('entry IDs', () => {
    it('generates unique IDs for each entry', () => {
      const next = collector
        .addCommand('cmd1', 0, 'out1', 'err1')
        .addCommand('cmd2', 0, 'out2', '')

      const context = next.getSessionContext(TEST_CWD, TEST_SHELL)
      const ids = context.recentEntries.map((e) => e.id)
      const uniqueIds = new Set(ids)

      expect(uniqueIds.size).toBe(ids.length)
    })
  })
})
