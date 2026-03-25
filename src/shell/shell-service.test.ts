import { describe, it, expect } from 'vitest';

import {
  isNaturalLanguage,
  isTuiCliInvocation,
  shouldAutoEnableTuiFromPtyOutput,
  parseCommandResult,
  shouldTriggerAI,
  buildAIPrompt,
} from './shell-service';

import type { CommandResult } from '@/types/index';
import type { TaskType } from '@/ai/types';

// ---------------------------------------------------------------------------
// isNaturalLanguage
// ---------------------------------------------------------------------------

describe('isNaturalLanguage', () => {
  describe('returns true for natural language input', () => {
    it.each([
      ['what is docker?'],
      ['how do I list files?'],
      ['explain this error'],
      ['why is my server crashing?'],
      ['can you help me with git?'],
      ['please show me how to use grep'],
      ['what does this command do?'],
      ['tell me about kubernetes'],
      ['is node faster than python?'],
      ['hello'],
      ['hi'],
      ['hey there'],
      ['good morning'],
      ['thanks'],
      ['bye'],
    ])('"%s" -> true', (input) => {
      expect(isNaturalLanguage(input)).toBe(true);
    });
  });

  describe('returns false for shell commands', () => {
    it.each([
      ['ls -la'],
      ['git status'],
      ['cd /tmp && ls'],
      ['npm install react'],
      ['echo hello world'],
      ['docker ps -a'],
      ['cat /etc/hosts'],
      ['mkdir -p foo/bar'],
      ['python3 script.py'],
      ['curl https://example.com'],
      ['grep -r "TODO" .'],
      ['ssh user@host'],
      ['sudo apt-get update'],
      ['HOME=/tmp echo test'],
      ['./run.sh'],
      ['echo hello'],
    ])('"%s" -> false', (input) => {
      expect(isNaturalLanguage(input)).toBe(false);
    });
  });

  describe('returns false for edge cases', () => {
    it('empty string -> false', () => {
      expect(isNaturalLanguage('')).toBe(false);
    });

    it('whitespace only -> false', () => {
      expect(isNaturalLanguage('   ')).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// isTuiCliInvocation
// ---------------------------------------------------------------------------

describe('isTuiCliInvocation', () => {
  it.each([
    ['claude'],
    ['claude '],
    ['  claude  '],
    ['claude --help'],
    ['claude /some/project'],
    ['CLAUDE'],
  ])('"%s" -> true', (input) => {
    expect(isTuiCliInvocation(input)).toBe(true);
  });

  it.each([
    [''],
    ['   '],
    ['claudecode'],
    ['pre claude'],
    ['echo claude'],
  ])('"%s" -> false', (input) => {
    expect(isTuiCliInvocation(input)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shouldAutoEnableTuiFromPtyOutput
// ---------------------------------------------------------------------------

describe('shouldAutoEnableTuiFromPtyOutput', () => {
  it('detects alternate-screen sequence', () => {
    expect(shouldAutoEnableTuiFromPtyOutput('\x1b[?1049h')).toBe(true);
  });

  it('detects Claude Code banner text', () => {
    expect(shouldAutoEnableTuiFromPtyOutput('Welcome to Claude Code')).toBe(true);
  });

  it('detects Welcome back + Claude', () => {
    expect(
      shouldAutoEnableTuiFromPtyOutput('Welcome back Austin!\n… Claude …'),
    ).toBe(true);
  });

  it('detects Sonnet + effort line', () => {
    expect(
      shouldAutoEnableTuiFromPtyOutput('Sonnet 4.6 with high effort'),
    ).toBe(true);
  });

  it('returns false for unrelated shell noise', () => {
    expect(shouldAutoEnableTuiFromPtyOutput('ls: foo: No such file')).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// parseCommandResult
// ---------------------------------------------------------------------------

describe('parseCommandResult', () => {
  it('exit 0 -> success, isAITriggered false', () => {
    const result = parseCommandResult(0, 'output\n', '');

    expect(result).toEqual({
      exitCode: 0,
      stdout: 'output\n',
      stderr: '',
      isAITriggered: false,
    });
  });

  it('exit 127 -> command not found, isAITriggered true', () => {
    const result = parseCommandResult(
      127,
      '',
      'zsh: command not found: foobar',
    );

    expect(result).toEqual({
      exitCode: 127,
      stdout: '',
      stderr: 'zsh: command not found: foobar',
      isAITriggered: true,
    });
  });

  it('exit 1 with stderr -> failure, isAITriggered true', () => {
    const result = parseCommandResult(
      1,
      '',
      'Error: ENOENT: no such file or directory',
    );

    expect(result).toEqual({
      exitCode: 1,
      stdout: '',
      stderr: 'Error: ENOENT: no such file or directory',
      isAITriggered: true,
    });
  });

  it('exit 0 with output -> success with stdout captured', () => {
    const stdout = 'file1.txt\nfile2.txt\nfile3.txt\n';
    const result = parseCommandResult(0, stdout, '');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(stdout);
    expect(result.stderr).toBe('');
    expect(result.isAITriggered).toBe(false);
  });

  it('exit 2 with both stdout and stderr -> failure, isAITriggered true', () => {
    const result = parseCommandResult(2, 'partial output', 'fatal error');

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('partial output');
    expect(result.stderr).toBe('fatal error');
    expect(result.isAITriggered).toBe(true);
  });

  it('result is immutable (readonly shape)', () => {
    const result = parseCommandResult(0, 'hi', '');

    // TypeScript enforces readonly at compile time. At runtime we just
    // verify the shape is a plain object (not a class instance).
    expect(typeof result).toBe('object');
    expect(result).not.toBeInstanceOf(Array);
  });
});

// ---------------------------------------------------------------------------
// shouldTriggerAI
// ---------------------------------------------------------------------------

describe('shouldTriggerAI', () => {
  const successResult: CommandResult = {
    exitCode: 0,
    stdout: 'ok',
    stderr: '',
    isAITriggered: false,
  };

  const notFoundResult: CommandResult = {
    exitCode: 127,
    stdout: '',
    stderr: 'command not found: foobar',
    isAITriggered: true,
  };

  const failedResult: CommandResult = {
    exitCode: 1,
    stdout: '',
    stderr: 'permission denied',
    isAITriggered: true,
  };

  it('natural language input -> true (regardless of result)', () => {
    expect(shouldTriggerAI('what is docker?', null)).toBe(true);
    expect(shouldTriggerAI('how do I list files?', successResult)).toBe(true);
  });

  it('command not found (127) -> true', () => {
    expect(shouldTriggerAI('foobar', notFoundResult)).toBe(true);
  });

  it('command failed with error -> true', () => {
    expect(shouldTriggerAI('rm /protected', failedResult)).toBe(true);
  });

  it('successful command -> false', () => {
    expect(shouldTriggerAI('ls -la', successResult)).toBe(false);
  });

  it('null result with non-natural-language input -> false', () => {
    expect(shouldTriggerAI('ls -la', null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildAIPrompt
// ---------------------------------------------------------------------------

describe('buildAIPrompt', () => {
  const notFoundResult: CommandResult = {
    exitCode: 127,
    stdout: '',
    stderr: 'zsh: command not found: dockr',
    isAITriggered: true,
  };

  const errorResult: CommandResult = {
    exitCode: 1,
    stdout: '',
    stderr: 'fatal: not a git repository',
    isAITriggered: true,
  };

  describe('command not found', () => {
    it('includes the failed command in the prompt', () => {
      const prompt = buildAIPrompt('dockr ps', notFoundResult, 'command_help');

      expect(prompt).toContain('dockr ps');
    });

    it('includes the stderr in the prompt', () => {
      const prompt = buildAIPrompt('dockr ps', notFoundResult, 'command_help');

      expect(prompt).toContain('command not found: dockr');
    });

    it('asks for correction suggestions', () => {
      const prompt = buildAIPrompt('dockr ps', notFoundResult, 'command_help');

      expect(prompt).toMatch(/suggest|correct|mean|did you mean/i);
    });
  });

  describe('error analysis', () => {
    it('includes stderr in the prompt', () => {
      const prompt = buildAIPrompt('git log', errorResult, 'error_analysis');

      expect(prompt).toContain('fatal: not a git repository');
    });

    it('asks for error analysis', () => {
      const prompt = buildAIPrompt('git log', errorResult, 'error_analysis');

      expect(prompt).toMatch(/analy|explain|diagnos|cause|fix/i);
    });

    it('includes the original command', () => {
      const prompt = buildAIPrompt('git log', errorResult, 'error_analysis');

      expect(prompt).toContain('git log');
    });
  });

  describe('natural language passthrough', () => {
    it('passes through the question for general task type', () => {
      const prompt = buildAIPrompt(
        'what is docker?',
        null,
        'general',
      );

      expect(prompt).toContain('what is docker?');
    });

    it('passes through for code_explain task type', () => {
      const prompt = buildAIPrompt(
        'explain how async/await works',
        null,
        'code_explain',
      );

      expect(prompt).toContain('explain how async/await works');
    });
  });

  describe('returns a non-empty string for all task types', () => {
    const taskTypes: readonly TaskType[] = [
      'command_help',
      'code_explain',
      'general',
      'error_analysis',
    ] as const;

    it.each(taskTypes)('taskType "%s" -> non-empty prompt', (taskType) => {
      const prompt = buildAIPrompt('test input', null, taskType);

      expect(prompt.length).toBeGreaterThan(0);
    });
  });
});
