import { describe, it, expect } from 'vitest';
import { parseMessageIntoParts } from './message-parts';

describe('parseMessageIntoParts', () => {
  describe('text-only messages', () => {
    it('parses plain text as a single TextPart', () => {
      const parts = parseMessageIntoParts('Hello, this is a response.');
      expect(parts).toHaveLength(1);
      expect(parts[0].type).toBe('text');
      if (parts[0].type === 'text') {
        expect(parts[0].content).toBe('Hello, this is a response.');
      }
    });

    it('returns empty array for empty string', () => {
      const parts = parseMessageIntoParts('');
      expect(parts).toHaveLength(0);
    });

    it('trims whitespace-only content', () => {
      const parts = parseMessageIntoParts('   \n\n   ');
      expect(parts).toHaveLength(0);
    });
  });

  describe('executed commands', () => {
    it('parses executed run command', () => {
      const parts = parseMessageIntoParts('⚡ Executed: `cargo test`');
      expect(parts).toHaveLength(1);
      expect(parts[0].type).toBe('tool');
      if (parts[0].type === 'tool') {
        expect(parts[0].tool).toBe('run');
        expect(parts[0].command).toBe('cargo test');
        expect(parts[0].status).toBe('done');
      }
    });

    it('separates text before and after command', () => {
      const parts = parseMessageIntoParts('Starting.\n\n⚡ Executed: `npm test`\n\nDone.');
      expect(parts).toHaveLength(3);
      expect(parts[0].type).toBe('text');
      expect(parts[1].type).toBe('tool');
      expect(parts[2].type).toBe('text');
    });
  });

  describe('file reads', () => {
    it('parses file read indicator', () => {
      const parts = parseMessageIntoParts('📄 Read **src/main.rs** — 35 lines, 1KB');
      expect(parts).toHaveLength(1);
      expect(parts[0].type).toBe('file');
      if (parts[0].type === 'file') {
        expect(parts[0].path).toBe('src/main.rs');
        expect(parts[0].lines).toBe(35);
        expect(parts[0].size).toBe(1024);
      }
    });
  });

  describe('diffs', () => {
    it('parses diff with added and removed lines', () => {
      const content = '✅ **src/main.rs**\n```diff\n- const x = 1;\n+ const x = 2;\n```';
      const parts = parseMessageIntoParts(content);
      expect(parts).toHaveLength(1);
      expect(parts[0].type).toBe('diff');
      if (parts[0].type === 'diff') {
        expect(parts[0].path).toBe('src/main.rs');
        expect(parts[0].removed).toEqual(['const x = 1;']);
        expect(parts[0].added).toEqual(['const x = 2;']);
      }
    });
  });

  describe('errors', () => {
    it('parses error operations', () => {
      const parts = parseMessageIntoParts('❌ edit src/main.rs: Search text not found');
      expect(parts).toHaveLength(1);
      expect(parts[0].type).toBe('tool');
      if (parts[0].type === 'tool') {
        expect(parts[0].status).toBe('error');
        expect(parts[0].error).toBe('Search text not found');
      }
    });
  });

  describe('mixed content', () => {
    it('parses interleaved text and tool calls', () => {
      const content = [
        'Let me fix the tests.',
        '📄 Read **tests/test.rs** — 50 lines, 2KB',
        '⚡ Executed: `cargo test`',
        'All tests pass now.',
      ].join('\n\n');
      const parts = parseMessageIntoParts(content);
      // Should have: text, file, tool, text
      expect(parts.length).toBeGreaterThanOrEqual(3);
      expect(parts[0].type).toBe('text');
      const toolParts = parts.filter(p => p.type === 'tool' || p.type === 'file');
      expect(toolParts.length).toBeGreaterThanOrEqual(2);
    });

    it('preserves ordering of parts', () => {
      const content = '⚡ Executed: `ls`\n\nFiles listed.\n\n⚡ Executed: `pwd`';
      const parts = parseMessageIntoParts(content);
      expect(parts[0].type).toBe('tool');
      expect(parts[1].type).toBe('text');
      expect(parts[2].type).toBe('tool');
    });
  });
});
