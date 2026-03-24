/**
 * Shell service — pure functions for the AI/terminal hybrid routing logic.
 *
 * These functions determine whether user input is natural language or a shell
 * command, parse command results, decide if AI should activate, and build
 * AI prompts for different scenarios.
 *
 * All functions are pure: no side effects, no mutation.
 */

import type { CommandResult } from '@/types/index';
import type { TaskType } from '@/ai/types';

// ---------------------------------------------------------------------------
// Natural language detection
// ---------------------------------------------------------------------------

/**
 * Patterns that strongly indicate natural language rather than a shell command.
 *
 * The heuristic checks for:
 * 1. Question words at the start (what, how, why, when, where, who, which)
 * 2. Imperative phrases common in questions/requests (explain, tell me, show me, help, please, can you, could you)
 * 3. Trailing question marks
 */
const QUESTION_STARTERS = /^(what|how|why|when|where|who|which)\b/i;
const REQUEST_STARTERS = /^(explain|tell\s+me|show\s+me|help|please|can\s+you|could\s+you|describe|is\s+there)\b/i;
const TRAILING_QUESTION = /\?\s*$/;

/**
 * Determines whether the given input looks like natural language
 * (a question or request) rather than a shell command.
 *
 * Returns `false` for empty/whitespace-only strings.
 */
export function isNaturalLanguage(input: string): boolean {
  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return false;
  }

  if (QUESTION_STARTERS.test(trimmed)) {
    return true;
  }

  if (REQUEST_STARTERS.test(trimmed)) {
    return true;
  }

  if (TRAILING_QUESTION.test(trimmed)) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Command result parsing
// ---------------------------------------------------------------------------

/**
 * Parses raw command output into a `CommandResult`.
 *
 * A command triggers AI when:
 * - Exit code is 127 (command not found)
 * - Exit code is non-zero (command failed — AI can help diagnose)
 */
export function parseCommandResult(
  exitCode: number,
  stdout: string,
  stderr: string,
): CommandResult {
  const isAITriggered = exitCode !== 0;

  return {
    exitCode,
    stdout,
    stderr,
    isAITriggered,
  };
}

// ---------------------------------------------------------------------------
// AI trigger decision
// ---------------------------------------------------------------------------

/**
 * Determines whether AI should activate for the given input and result.
 *
 * AI activates when:
 * 1. The input is natural language (regardless of command result)
 * 2. The command result indicates a failure (non-zero exit code)
 *
 * Returns `false` for successful commands and for shell-like input
 * with no result yet.
 */
export function shouldTriggerAI(
  input: string,
  result: CommandResult | null,
): boolean {
  if (isNaturalLanguage(input)) {
    return true;
  }

  if (result !== null && result.exitCode !== 0) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// AI prompt construction
// ---------------------------------------------------------------------------

/**
 * Builds an AI prompt tailored to the scenario.
 *
 * Prompt structure varies by task type:
 * - `command_help`: the command failed or wasn't found; suggest corrections
 * - `error_analysis`: a command produced an error; analyze and explain
 * - `code_explain`: user wants code/concept explained
 * - `general`: general knowledge question
 */
export function buildAIPrompt(
  input: string,
  result: CommandResult | null,
  taskType: TaskType,
): string {
  switch (taskType) {
    case 'command_help':
      return buildCommandHelpPrompt(input, result);
    case 'error_analysis':
      return buildErrorAnalysisPrompt(input, result);
    case 'code_explain':
      return buildCodeExplainPrompt(input);
    case 'general':
      return buildGeneralPrompt(input);
  }
}

function buildCommandHelpPrompt(
  input: string,
  result: CommandResult | null,
): string {
  const parts: readonly string[] = [
    `The user ran the command: \`${input}\``,
    result !== null
      ? `It failed with exit code ${result.exitCode}.`
      : 'It could not be executed.',
    result !== null && result.stderr.length > 0
      ? `Error output:\n${result.stderr}`
      : '',
    'Did you mean a different command? Suggest the correct command or closest alternatives.',
  ];

  return parts.filter((p) => p.length > 0).join('\n\n');
}

function buildErrorAnalysisPrompt(
  input: string,
  result: CommandResult | null,
): string {
  const parts: readonly string[] = [
    `The user ran: \`${input}\``,
    result !== null && result.stderr.length > 0
      ? `Error output:\n${result.stderr}`
      : '',
    result !== null
      ? `Exit code: ${result.exitCode}`
      : '',
    'Analyze this error. Explain the cause and suggest a fix.',
  ];

  return parts.filter((p) => p.length > 0).join('\n\n');
}

function buildCodeExplainPrompt(input: string): string {
  return `The user asks:\n\n${input}\n\nProvide a clear, concise explanation.`;
}

function buildGeneralPrompt(input: string): string {
  return `The user asks:\n\n${input}\n\nProvide a helpful, concise answer.`;
}
