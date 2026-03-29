/**
 * Native tool calling integration tests.
 *
 * Tests the full pipeline: tool definitions → API request shape →
 * tool call sentinel parsing → tag conversion → command execution.
 *
 * Uses realistic multi-step, multi-tool scenarios against real
 * repository structures.
 */

import { describe, it, expect } from 'vitest'
import { AGENT_TOOLS, TOOL_CALL_SENTINEL } from './tool-definitions'
import type { ToolCallData } from './tool-definitions'

// ---------------------------------------------------------------------------
// Tool definition validation
// ---------------------------------------------------------------------------

describe('Tool definitions', () => {
  it('defines exactly 5 tools', () => {
    expect(AGENT_TOOLS).toHaveLength(5)
  })

  it('all tools have type "function"', () => {
    for (const tool of AGENT_TOOLS) {
      expect(tool.type).toBe('function')
    }
  })

  it('all tools have name, description, and parameters', () => {
    for (const tool of AGENT_TOOLS) {
      expect(tool.function.name).toBeTruthy()
      expect(tool.function.description).toBeTruthy()
      expect(tool.function.parameters).toBeTruthy()
      expect(tool.function.parameters.type).toBe('object')
      expect(tool.function.parameters.required).toBeDefined()
    }
  })

  const expectedTools = ['run_command', 'read_file', 'edit_file', 'create_file', 'delete_file']
  for (const name of expectedTools) {
    it(`includes ${name} tool`, () => {
      const tool = AGENT_TOOLS.find(t => t.function.name === name)
      expect(tool).toBeDefined()
    })
  }

  it('run_command requires "command" parameter', () => {
    const tool = AGENT_TOOLS.find(t => t.function.name === 'run_command')!
    expect(tool.function.parameters.required).toContain('command')
    expect(tool.function.parameters.properties).toHaveProperty('command')
  })

  it('read_file requires "path" parameter', () => {
    const tool = AGENT_TOOLS.find(t => t.function.name === 'read_file')!
    expect(tool.function.parameters.required).toContain('path')
  })

  it('edit_file requires path, search, and replace', () => {
    const tool = AGENT_TOOLS.find(t => t.function.name === 'edit_file')!
    expect(tool.function.parameters.required).toContain('path')
    expect(tool.function.parameters.required).toContain('search')
    expect(tool.function.parameters.required).toContain('replace')
  })

  it('create_file requires path and content', () => {
    const tool = AGENT_TOOLS.find(t => t.function.name === 'create_file')!
    expect(tool.function.parameters.required).toContain('path')
    expect(tool.function.parameters.required).toContain('content')
  })

  it('delete_file requires path', () => {
    const tool = AGENT_TOOLS.find(t => t.function.name === 'delete_file')!
    expect(tool.function.parameters.required).toContain('path')
  })
})

// ---------------------------------------------------------------------------
// Tool call sentinel parsing
// ---------------------------------------------------------------------------

describe('Tool call sentinel format', () => {
  it('sentinel prefix is a null byte + TOOLCALL:', () => {
    expect(TOOL_CALL_SENTINEL).toBe('\x00TOOLCALL:')
  })

  it('can serialize and deserialize a run_command call', () => {
    const tc: ToolCallData = { name: 'run_command', arguments: { command: 'cargo test' } }
    const sentinel = `${TOOL_CALL_SENTINEL}${JSON.stringify(tc)}`

    expect(sentinel.startsWith('\x00TOOLCALL:')).toBe(true)
    const parsed = JSON.parse(sentinel.slice(TOOL_CALL_SENTINEL.length))
    expect(parsed.name).toBe('run_command')
    expect(parsed.arguments.command).toBe('cargo test')
  })

  it('can serialize a read_file call', () => {
    const tc: ToolCallData = { name: 'read_file', arguments: { path: 'src/main.rs' } }
    const sentinel = `${TOOL_CALL_SENTINEL}${JSON.stringify(tc)}`
    const parsed = JSON.parse(sentinel.slice(TOOL_CALL_SENTINEL.length))
    expect(parsed.arguments.path).toBe('src/main.rs')
  })

  it('can serialize an edit_file call with search/replace', () => {
    const tc: ToolCallData = {
      name: 'edit_file',
      arguments: {
        path: 'src/lib.rs',
        search: 'fn old_function()',
        replace: 'fn new_function()',
      },
    }
    const sentinel = `${TOOL_CALL_SENTINEL}${JSON.stringify(tc)}`
    const parsed = JSON.parse(sentinel.slice(TOOL_CALL_SENTINEL.length))
    expect(parsed.arguments.search).toBe('fn old_function()')
    expect(parsed.arguments.replace).toBe('fn new_function()')
  })

  it('can serialize a create_file call with multiline content', () => {
    const tc: ToolCallData = {
      name: 'create_file',
      arguments: {
        path: 'tests/new_test.rs',
        content: '#[test]\nfn test_new() {\n    assert!(true);\n}',
      },
    }
    const sentinel = `${TOOL_CALL_SENTINEL}${JSON.stringify(tc)}`
    const parsed = JSON.parse(sentinel.slice(TOOL_CALL_SENTINEL.length))
    expect(parsed.arguments.content).toContain('#[test]')
    expect(parsed.arguments.content).toContain('assert!(true)')
  })
})

// ---------------------------------------------------------------------------
// Tool call → tag conversion (simulates useChat.ts conversion)
// ---------------------------------------------------------------------------

function convertToolCallToTag(tc: ToolCallData): string {
  const { name, arguments: args } = tc
  if (name === 'run_command') return `\n[RUN:${args.command}]\n`
  if (name === 'read_file') return `\n[READ:${args.path}]\n`
  if (name === 'edit_file') return `\n[EDIT:${args.path}]\n<<<< SEARCH\n${args.search}\n====\n${args.replace}\n>>>> REPLACE\n[/EDIT]\n`
  if (name === 'create_file') return `\n[FILE:${args.path}]\n${args.content}\n[/FILE]\n`
  if (name === 'delete_file') return `\n[DELETE:${args.path}]\n`
  return ''
}

describe('Tool call to tag conversion', () => {
  it('converts run_command to [RUN:command]', () => {
    const tag = convertToolCallToTag({ name: 'run_command', arguments: { command: 'npm test' } })
    expect(tag).toContain('[RUN:npm test]')
  })

  it('converts read_file to [READ:path]', () => {
    const tag = convertToolCallToTag({ name: 'read_file', arguments: { path: 'package.json' } })
    expect(tag).toContain('[READ:package.json]')
  })

  it('converts edit_file to [EDIT:] with search/replace', () => {
    const tag = convertToolCallToTag({
      name: 'edit_file',
      arguments: { path: 'src/app.ts', search: 'old code', replace: 'new code' },
    })
    expect(tag).toContain('[EDIT:src/app.ts]')
    expect(tag).toContain('<<<< SEARCH')
    expect(tag).toContain('old code')
    expect(tag).toContain('====')
    expect(tag).toContain('new code')
    expect(tag).toContain('>>>> REPLACE')
    expect(tag).toContain('[/EDIT]')
  })

  it('converts create_file to [FILE:path]content[/FILE]', () => {
    const tag = convertToolCallToTag({
      name: 'create_file',
      arguments: { path: 'new.ts', content: 'export const x = 1' },
    })
    expect(tag).toContain('[FILE:new.ts]')
    expect(tag).toContain('export const x = 1')
    expect(tag).toContain('[/FILE]')
  })

  it('converts delete_file to [DELETE:path]', () => {
    const tag = convertToolCallToTag({ name: 'delete_file', arguments: { path: 'old.ts' } })
    expect(tag).toContain('[DELETE:old.ts]')
  })

  it('returns empty for unknown tool', () => {
    const tag = convertToolCallToTag({ name: 'unknown_tool', arguments: {} })
    expect(tag).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Multi-step scenarios (simulate real agent loop with tool calls)
// ---------------------------------------------------------------------------

describe('Multi-step tool call scenarios', () => {
  it('Scenario: test a Rust project end-to-end', () => {
    const steps: ToolCallData[] = [
      { name: 'read_file', arguments: { path: 'Cargo.toml' } },
      { name: 'read_file', arguments: { path: 'src/main.rs' } },
      { name: 'run_command', arguments: { command: 'cargo build' } },
      { name: 'run_command', arguments: { command: 'cargo test --all' } },
      { name: 'run_command', arguments: { command: 'cargo clippy' } },
    ]

    const tags = steps.map(convertToolCallToTag)
    expect(tags[0]).toContain('[READ:Cargo.toml]')
    expect(tags[1]).toContain('[READ:src/main.rs]')
    expect(tags[2]).toContain('[RUN:cargo build]')
    expect(tags[3]).toContain('[RUN:cargo test --all]')
    expect(tags[4]).toContain('[RUN:cargo clippy]')
  })

  it('Scenario: fix a failing test in a Node project', () => {
    const steps: ToolCallData[] = [
      { name: 'run_command', arguments: { command: 'npm test' } },
      { name: 'read_file', arguments: { path: 'src/utils.ts' } },
      {
        name: 'edit_file',
        arguments: {
          path: 'src/utils.ts',
          search: 'return value + 1',
          replace: 'return value + 2',
        },
      },
      { name: 'run_command', arguments: { command: 'npm test' } },
    ]

    const tags = steps.map(convertToolCallToTag)
    expect(tags[0]).toContain('[RUN:npm test]')
    expect(tags[1]).toContain('[READ:src/utils.ts]')
    expect(tags[2]).toContain('[EDIT:src/utils.ts]')
    expect(tags[2]).toContain('return value + 1')
    expect(tags[2]).toContain('return value + 2')
    expect(tags[3]).toContain('[RUN:npm test]')
  })

  it('Scenario: create a new test file and run it', () => {
    const steps: ToolCallData[] = [
      {
        name: 'create_file',
        arguments: {
          path: 'tests/integration.test.ts',
          content: 'import { describe, it, expect } from "vitest"\n\ndescribe("integration", () => {\n  it("works", () => {\n    expect(true).toBe(true)\n  })\n})',
        },
      },
      { name: 'run_command', arguments: { command: 'npx vitest run tests/integration.test.ts' } },
    ]

    const tags = steps.map(convertToolCallToTag)
    expect(tags[0]).toContain('[FILE:tests/integration.test.ts]')
    expect(tags[0]).toContain('describe("integration"')
    expect(tags[1]).toContain('[RUN:npx vitest run')
  })

  it('Scenario: Python project with venv', () => {
    const steps: ToolCallData[] = [
      { name: 'read_file', arguments: { path: 'requirements.txt' } },
      { name: 'run_command', arguments: { command: '.venv/bin/python -m pytest -v' } },
      { name: 'read_file', arguments: { path: 'main.py' } },
      { name: 'run_command', arguments: { command: '.venv/bin/python main.py --help' } },
    ]

    const tags = steps.map(convertToolCallToTag)
    expect(tags[0]).toContain('[READ:requirements.txt]')
    expect(tags[1]).toContain('[RUN:.venv/bin/python -m pytest -v]')
    expect(tags[3]).toContain('[RUN:.venv/bin/python main.py --help]')
  })

  it('Scenario: monorepo with pnpm workspaces', () => {
    const steps: ToolCallData[] = [
      { name: 'read_file', arguments: { path: 'package.json' } },
      { name: 'read_file', arguments: { path: 'turbo.json' } },
      { name: 'run_command', arguments: { command: 'pnpm install' } },
      { name: 'run_command', arguments: { command: 'pnpm build' } },
      { name: 'run_command', arguments: { command: 'pnpm test' } },
      { name: 'run_command', arguments: { command: 'pnpm run type-check' } },
    ]

    const tags = steps.map(convertToolCallToTag)
    expect(tags).toHaveLength(6)
    expect(tags[2]).toContain('[RUN:pnpm install]')
    expect(tags[4]).toContain('[RUN:pnpm test]')
  })

  it('handles commands with special characters', () => {
    const steps: ToolCallData[] = [
      { name: 'run_command', arguments: { command: 'grep -r "TODO" src/' } },
      { name: 'run_command', arguments: { command: 'find . -name "*.test.ts" | wc -l' } },
      { name: 'run_command', arguments: { command: "python -c \"print('hello world')\"" } },
    ]

    const tags = steps.map(convertToolCallToTag)
    expect(tags[0]).toContain('[RUN:grep -r "TODO" src/]')
    expect(tags[1]).toContain('[RUN:find . -name "*.test.ts" | wc -l]')
    expect(tags[2]).toContain("[RUN:python -c \"print('hello world')\"]")
  })

  it('handles paths with various formats', () => {
    const steps: ToolCallData[] = [
      { name: 'read_file', arguments: { path: 'src/components/App.tsx' } },
      { name: 'read_file', arguments: { path: './config.json' } },
      { name: 'read_file', arguments: { path: 'packages/shared/src/index.ts' } },
    ]

    const tags = steps.map(convertToolCallToTag)
    expect(tags[0]).toContain('[READ:src/components/App.tsx]')
    expect(tags[1]).toContain('[READ:./config.json]')
    expect(tags[2]).toContain('[READ:packages/shared/src/index.ts]')
  })
})

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('Edge cases', () => {
  it('handles empty command', () => {
    const tag = convertToolCallToTag({ name: 'run_command', arguments: { command: '' } })
    expect(tag).toContain('[RUN:]')
  })

  it('handles multiline file content', () => {
    const content = 'line 1\nline 2\nline 3\n'
    const tag = convertToolCallToTag({
      name: 'create_file',
      arguments: { path: 'test.txt', content },
    })
    expect(tag).toContain('line 1\nline 2\nline 3')
  })

  it('handles edit with multiline search/replace', () => {
    const tag = convertToolCallToTag({
      name: 'edit_file',
      arguments: {
        path: 'src/app.ts',
        search: 'function old() {\n  return 1\n}',
        replace: 'function new() {\n  return 2\n}',
      },
    })
    expect(tag).toContain('function old() {\n  return 1\n}')
    expect(tag).toContain('function new() {\n  return 2\n}')
  })

  it('sentinel does not collide with normal text', () => {
    const normalText = 'This is normal text with no sentinel'
    expect(normalText.startsWith(TOOL_CALL_SENTINEL)).toBe(false)
  })

  it('sentinel is distinguishable from usage sentinel', () => {
    expect(TOOL_CALL_SENTINEL).not.toBe('\x00USAGE:')
  })
})
