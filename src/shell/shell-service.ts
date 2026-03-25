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
 * 2. Imperative phrases common in questions/requests
 * 3. Action phrases (make, create, build, take me, open, etc.)
 * 4. Trailing question marks
 * 5. Short greetings / thanks / bye (e.g. "hello", "good morning")
 * 6. Multi-word input that doesn't look like a command
 */
const QUESTION_STARTERS = /^(what|how|why|when|where|who|which)\b/i;
const REQUEST_STARTERS = /^(explain|tell\s+me|show\s+me|help|please|can\s+you|could\s+you|describe|is\s+there|i\s+want|i\s+need|analyze|review|understand|check|audit|summarize|walk\s+me\s+through)\b/i;
const ACTION_STARTERS = /^(make\s+a|make\s+me|create|generate|set\s+up|setup|take\s+me|go\s+to|navigate|move\s+to|switch\s+to|deploy\s+to|deploy\s+the)\b/i;
const TRAILING_QUESTION = /\?\s*$/;

/**
 * Short social / greeting input — not shell. Keeps "hello" from hitting the PTY
 * and then error-analysis flow.
 */
const GREETING_OR_SOCIAL =
  /^(?:hello|hi|hey|howdy|sup|yo|greetings|morning|afternoon|evening)(?:\s+there)?$|^(?:good\s+(?:morning|afternoon|evening))$|^(?:thanks|thank\s+you|thx|bye|goodbye|cheers|ciao)\s*!*$/i;

/** Common command prefixes that should NOT be treated as natural language. */
const COMMAND_PREFIXES = /^(cd|ls|cat|echo|grep|find|awk|sed|curl|wget|git|npm|npx|yarn|pnpm|bun|node|python|python3|pip|brew|apt|sudo|chmod|chown|mv|cp|rm|mkdir|touch|tar|zip|unzip|ssh|scp|docker|kubectl|make|cargo|go|rustc|gcc|java|javac|ruby|php|perl|which|whereis|man|env|export|source|alias|kill|ps|top|htop|df|du|mount|ping|traceroute|nslookup|dig|ifconfig|ip|netstat|systemctl|journalctl|crontab|tmux|screen|vim|vi|nano|emacs|code|claude|bat|exa|fd|rg|fzf|jq|yq|xargs|tee|wc|sort|uniq|head|tail|diff|patch|file|stat|readlink|basename|dirname|realpath|test|true|false|exit|clear|reset|history|set|unset|trap|wait|nohup|time|date|cal|uptime|whoami|hostname|uname|arch|sw_vers|pbcopy|pbpaste|open|say|osascript|defaults|launchctl|diskutil|hdiutil|codesign|xcrun|xcodebuild|swift|swiftc|clang|lldb|otool|lipo|xattr|mdls|mdfind|spotlight|dscl|ditto|installer|pkgutil|softwareupdate|start|stop|run|build|install|update|remove|delete|deploy|fix|debug|search)\b/;

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

  // Check for NL patterns that use command words FIRST (before command prefix check)
  // These are natural language requests that happen to start with command-like words
  const NL_COMMAND_PATTERNS = [
    /^(cd\s+(into|to)\s+)/i,           // "cd into Desktop", "cd to project"
    /^(change\s+directory\s+(to|into)\s+)/i,  // "change directory to Desktop"
    /^(list\s+(files|directory|dirs)\s+(in|from|for)\s+)/i,  // "list files in src"
    /^(show\s+(me\s+)?(files|directory|dir|folders)\s+(in|from|for)\s+)/i,  // "show files in src"
  ];

  for (const pattern of NL_COMMAND_PATTERNS) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }

  if (GREETING_OR_SOCIAL.test(trimmed)) {
    return true;
  }

  // If it starts with a known shell command, it's not natural language
  if (COMMAND_PREFIXES.test(trimmed)) {
    return false;
  }

  if (QUESTION_STARTERS.test(trimmed)) {
    return true;
  }

  if (REQUEST_STARTERS.test(trimmed)) {
    return true;
  }

  if (ACTION_STARTERS.test(trimmed)) {
    return true;
  }

  if (TRAILING_QUESTION.test(trimmed)) {
    return true;
  }

  // Multi-word phrases with 3+ words that contain spaces are likely natural language
  // (shell commands are typically 1-2 words with flags)
  const words = trimmed.split(/\s+/);
  if (words.length >= 4 && !/^[.\/~$]/.test(trimmed) && !trimmed.includes('|') && !trimmed.includes('>') && !trimmed.includes('&&')) {
    return true;
  }

  return false;
}

/**
 * True when the user submitted a line that launches an interactive TUI CLI
 * (Claude Code, etc.) — AITerminal should enable TUI mode so prompts like `> hello`
 * are not routed to the AI chat as natural language.
 */
export function isTuiCliInvocation(input: string): boolean {
  const t = input.trim();
  if (!t) return false;
  // Anthropic Claude Code CLI (also matches `claude --help`, `claude /path`)
  if (/^claude(\s|$)/i.test(t)) return true;
  return false;
}

/**
 * Heuristic: PTY output indicates a full-screen TUI or Claude Code's REPL is active.
 * Used to auto-enable TUI mode if the user didn't launch via a detected command line.
 */
export function shouldAutoEnableTuiFromPtyOutput(data: string): boolean {
  // Alternate screen buffer — used by many TUIs (vim, claude, etc.)
  if (data.includes('\x1b[?1049h')) return true;
  // Claude Code branding / welcome (see Anthropic CLI banners)
  if (/Claude Code/i.test(data)) return true;
  if (/Welcome back\b/i.test(data) && /\bClaude\b/i.test(data)) return true;
  if (/\bSonnet\b.*\b(?:high|low|medium)\s+effort/i.test(data)) return true;
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
