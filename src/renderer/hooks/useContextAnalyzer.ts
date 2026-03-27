import { useState, useCallback } from 'react';
import type { ClaudeCodeMessage } from '../../types';

/**
 * Pattern detection result from analyzing Claude Code logs
 */
export interface AnalysisResult {
  /** Whether any error patterns were detected */
  hasErrors: boolean;
  /** Specific error patterns found (e.g., "command not found", "undefined is not a function") */
  errorPatterns: string[];
  /** Whether the user appears stuck (same error repeated 3+ times) */
  isStuck: boolean;
  /** Stuck severity: 3-5 repetitions = "stuck", 6+ = "very stuck" */
  stuckSeverity: 'none' | 'stuck' | 'very_stuck';
  /** Positive indicators detected (tests passing, fixes applied, etc.) */
  achievements: string[];
  /** Topics the user seems confused about */
  confusionTopics: string[];
  /** Actionable suggestions based on detected patterns */
  suggestions: string[];
  /** Overall sentiment of the session */
  sentiment: 'positive' | 'neutral' | 'concerned';
  /** Confidence score 0-1 based on pattern strength and message count */
  confidence: number;
  /** Total messages analyzed */
  messageCount: number;
  /** Timestamp of oldest message analyzed */
  timeRange?: {
    start: number;
    end: number;
    durationMs: number;
  };
}

/**
 * Error pattern definitions with regex and suggestion mappings
 */
interface ErrorPattern {
  name: string;
  regex: RegExp;
  suggestions: string[];
  category: 'command' | 'code' | 'permission' | 'network' | 'build' | 'test' | 'generic';
}

/**
 * Achievement pattern definitions
 */
interface AchievementPattern {
  name: string;
  regex: RegExp;
  icon: string;
}

/**
 * Confusion pattern definitions
 */
interface ConfusionPattern {
  name: string;
  regex: RegExp;
  extractTopic?: boolean;
}

// Error patterns database
const ERROR_PATTERNS: ErrorPattern[] = [
  {
    name: 'command not found',
    regex: /command not found|not recognized|no such file or directory/i,
    suggestions: [
      'Check if the command is installed',
      'Verify PATH environment variable',
      'Try installing the missing package',
      'Check for typos in the command name',
    ],
    category: 'command',
  },
  {
    name: 'permission denied',
    regex: /permission denied|access denied|unauthorized|eacces/i,
    suggestions: [
      'Try running with sudo (if appropriate)',
      'Check file/directory ownership',
      'Verify execute permissions on scripts',
      'Check if the resource is locked by another process',
    ],
    category: 'permission',
  },
  {
    name: 'undefined is not a function',
    regex: /undefined is not a function|cannot read property \w+ of undefined|null reference/i,
    suggestions: [
      'Check if the object/function is properly imported',
      'Verify variable initialization',
      'Check for typos in property names',
      'Add optional chaining or null checks',
    ],
    category: 'code',
  },
  {
    name: 'module not found',
    regex: /cannot find module|module not found|failed to resolve|cannot import/i,
    suggestions: [
      'Install missing dependencies (npm install / yarn add)',
      'Check import path is correct',
      'Verify the module is in package.json',
      'Clear node_modules and reinstall',
    ],
    category: 'code',
  },
  {
    name: 'syntax error',
    regex: /syntaxerror|unexpected token|unexpected identifier|parse error/i,
    suggestions: [
      'Check for missing brackets, braces, or parentheses',
      'Verify proper string quotes and escaping',
      'Look for typos in keywords',
      'Check for missing semicolons or commas',
    ],
    category: 'code',
  },
  {
    name: 'type error',
    regex: /typeerror|type '.*' is not assignable to type|argument of type/i,
    suggestions: [
      'Review TypeScript type definitions',
      'Add type assertions if appropriate',
      'Check function parameter types',
      'Verify interface/type imports',
    ],
    category: 'code',
  },
  {
    name: 'network error',
    regex: /network error|fetch failed|connection refused|timeout|etimedout|econnrefused/i,
    suggestions: [
      'Check internet connection',
      'Verify the server/service is running',
      'Check firewall settings',
      'Try again later (service might be temporarily unavailable)',
    ],
    category: 'network',
  },
  {
    name: 'build error',
    regex: /build failed|compilation error|webpack error|rollup error|vite error/i,
    suggestions: [
      'Check for syntax errors in source files',
      'Verify all dependencies are installed',
      'Check for circular dependencies',
      'Review build configuration',
    ],
    category: 'build',
  },
  {
    name: 'test failure',
    regex: /test failed|tests? failing|expect\(.*\).*(received|to be)|assertion failed/i,
    suggestions: [
      'Review the test expectations',
      'Check if implementation matches requirements',
      'Look for race conditions or async issues',
      'Verify test setup and teardown',
    ],
    category: 'test',
  },
  {
    name: 'port in use',
    regex: /port.*in use|address already in use|eaddrinuse/i,
    suggestions: [
      'Kill the process using the port',
      'Use a different port',
      'Check for orphaned processes',
      'Wait a moment and retry',
    ],
    category: 'generic',
  },
  {
    name: 'out of memory',
    regex: /out of memory|heap out of memory|allocation failed/i,
    suggestions: [
      'Increase Node.js memory limit (NODE_OPTIONS=--max-old-space-size=4096)',
      'Check for memory leaks',
      'Close unnecessary applications',
      'Process data in smaller chunks',
    ],
    category: 'generic',
  },
  {
    name: 'file not found',
    regex: /enoent|no such file or directory|file not found/i,
    suggestions: [
      'Verify the file path is correct',
      'Check if the file exists',
      'Use absolute paths if relative paths fail',
      'Check working directory',
    ],
    category: 'generic',
  },
];

// Achievement patterns
const ACHIEVEMENT_PATTERNS: AchievementPattern[] = [
  { name: 'tests passing', regex: /✓|passed|passing|tests? passed|all tests passed/i, icon: '✅' },
  { name: 'fix applied', regex: /fixed|resolved|patched|successfully applied/i, icon: '🔧' },
  { name: 'build successful', regex: /built successfully|compilation complete|build succeeded|successfully built/i, icon: '🏗️' },
  { name: 'task completed', regex: /completed|done|finished|ready/i, icon: '✨' },
  { name: 'deployment successful', regex: /deployed|published|released/i, icon: '🚀' },
];

// Confusion patterns
const CONFUSION_PATTERNS: ConfusionPattern[] = [
  { name: 'what is question', regex: /what is\s+(\w+)|what's\s+(\w+)/i, extractTopic: true },
  { name: 'how to question', regex: /how (do|to|can|should)\s+\w+/i, extractTopic: true },
  { name: 'why question', regex: /why (does|do|is|did)\s+/i, extractTopic: true },
  { name: 'general help', regex: /help|stuck|confused|don't understand|not sure/i, extractTopic: false },
  { name: 'explain request', regex: /explain|clarify|elaborate/i, extractTopic: false },
];

/**
 * Hook for analyzing Claude Code logs to detect troubleshooting patterns
 * @returns API for analyzing logs and retrieving results
 */
export function useContextAnalyzer() {
  const [lastAnalysis, setLastAnalysis] = useState<AnalysisResult | null>(null);

  /**
   * Analyze Claude Code messages for patterns
   */
  const analyzeLog = useCallback((messages: ClaudeCodeMessage[]): AnalysisResult => {
    if (!messages || messages.length === 0) {
      return createEmptyResult();
    }

    const errorPatterns = new Set<string>();
    const achievements = new Set<string>();
    const confusionTopics = new Set<string>();
    const allSuggestions = new Set<string>();
    const errorCounts = new Map<string, number>();

    let consecutiveErrors = 0;
    let maxConsecutiveErrors = 0;
    let positiveCount = 0;
    let negativeCount = 0;

    const timestamps: number[] = [];

    // Analyze each message
    messages.forEach((message) => {
      if (message.timestamp) {
        timestamps.push(message.timestamp);
      }

      const content = message.content;

      let messageHasError = false;

      // Check for error patterns
      ERROR_PATTERNS.forEach((pattern) => {
        if (pattern.regex.test(content)) {
          errorPatterns.add(pattern.name);
          errorCounts.set(pattern.name, (errorCounts.get(pattern.name) || 0) + 1);
          pattern.suggestions.forEach((s) => allSuggestions.add(s));
          negativeCount++;
          messageHasError = true;
        }
      });

      // Check for achievement patterns
      ACHIEVEMENT_PATTERNS.forEach((pattern) => {
        if (pattern.regex.test(content)) {
          achievements.add(pattern.name);
          positiveCount++;
        }
      });

      // Check for confusion patterns
      CONFUSION_PATTERNS.forEach((pattern) => {
        if (pattern.regex.test(content)) {
          if (pattern.extractTopic) {
            const match = content.match(pattern.regex);
            if (match && match[1]) {
              confusionTopics.add(match[1].trim());
            }
          } else {
            // Extract the question/topic from user messages
            if (message.role === 'user') {
              const topic = extractTopicFromQuestion(content);
              if (topic) {
                confusionTopics.add(topic);
              }
            }
          }
        }
      });

      // Track consecutive errors
      if (messageHasError) {
        consecutiveErrors++;
        maxConsecutiveErrors = Math.max(maxConsecutiveErrors, consecutiveErrors);
      } else {
        consecutiveErrors = 0;
      }
    });

    // Determine stuck status
    const isStuck = maxConsecutiveErrors >= 3;
    const stuckSeverity: 'none' | 'stuck' | 'very_stuck' =
      maxConsecutiveErrors >= 6 ? 'very_stuck' : isStuck ? 'stuck' : 'none';

    // Calculate sentiment
    const sentiment = calculateSentiment(positiveCount, negativeCount, isStuck);

    // Calculate confidence
    const confidence = calculateConfidence(messages.length, errorPatterns.size, achievements.size);

    // Generate additional suggestions based on context
    generateContextualSuggestions(messages, errorPatterns, allSuggestions);

    // Create result
    const result: AnalysisResult = {
      hasErrors: errorPatterns.size > 0,
      errorPatterns: Array.from(errorPatterns),
      isStuck,
      stuckSeverity,
      achievements: Array.from(achievements),
      confusionTopics: Array.from(confusionTopics),
      suggestions: Array.from(allSuggestions).slice(0, 8), // Limit to top 8
      sentiment,
      confidence,
      messageCount: messages.length,
      timeRange:
        timestamps.length > 1
          ? {
              start: Math.min(...timestamps),
              end: Math.max(...timestamps),
              durationMs: Math.max(...timestamps) - Math.min(...timestamps),
            }
          : undefined,
    };

    setLastAnalysis(result);
    return result;
  }, []);

  /**
   * Get the most recent analysis result
   */
  const getLastAnalysis = useCallback((): AnalysisResult | null => {
    return lastAnalysis;
  }, [lastAnalysis]);

  return {
    analyzeLog,
    getLastAnalysis,
  };
}

/**
 * Create an empty analysis result
 */
function createEmptyResult(): AnalysisResult {
  return {
    hasErrors: false,
    errorPatterns: [],
    isStuck: false,
    stuckSeverity: 'none',
    achievements: [],
    confusionTopics: [],
    suggestions: [],
    sentiment: 'neutral',
    confidence: 0,
    messageCount: 0,
  };
}

/**
 * Calculate sentiment based on positive/negative indicators
 */
function calculateSentiment(
  positiveCount: number,
  negativeCount: number,
  isStuck: boolean
): 'positive' | 'neutral' | 'concerned' {
  if (isStuck) return 'concerned';
  if (negativeCount > positiveCount * 2) return 'concerned';
  if (positiveCount > 0 && negativeCount === 0) return 'positive';
  if (positiveCount > negativeCount && positiveCount - negativeCount >= 2) return 'positive';
  return 'neutral';
}

/**
 * Calculate confidence score based on data quality
 */
function calculateConfidence(
  messageCount: number,
  errorCount: number,
  achievementCount: number
): number {
  if (messageCount === 0) return 0;

  // Base confidence from message count (more messages = more confidence)
  let confidence = Math.min(messageCount / 20, 1) * 0.5;

  // Add confidence from pattern detection
  const patternCount = errorCount + achievementCount;
  confidence += Math.min(patternCount / 10, 1) * 0.5;

  return Math.min(confidence, 1);
}

/**
 * Extract topic from a question
 */
function extractTopicFromQuestion(content: string): string | null {
  const trimmed = content.trim();

  // Extract first few words as topic
  const words = trimmed.split(/\s+/).slice(0, 5);
  if (words.length < 2) return null;

  return words.join(' ');
}

/**
 * Generate contextual suggestions based on message patterns
 */
function generateContextualSuggestions(
  messages: ClaudeCodeMessage[],
  errorPatterns: Set<string>,
  suggestions: Set<string>
): void {
  // Check for tool usage patterns
  const toolUsage = new Map<string, number>();
  messages.forEach((msg) => {
    if (msg.tools) {
      msg.tools.forEach((tool) => {
        toolUsage.set(tool.name, (toolUsage.get(tool.name) || 0) + 1);
      });
    }
  });

  // Suggest based on heavy tool usage
  if ((toolUsage.get('Bash') ?? 0) > 5) {
    suggestions.add('Consider combining multiple shell commands into a script');
  }

  if ((toolUsage.get('Read') ?? 0) > 10) {
    suggestions.add('You might benefit from searching the codebase instead of reading many files');
  }

  // Check for repeated file edits
  const editedFiles = new Set<string>();
  messages.forEach((msg) => {
    if (msg.tools) {
      msg.tools.forEach((tool) => {
        if (tool.name === 'Edit' && tool.input?.['file_path']) {
          editedFiles.add(String(tool.input['file_path']));
        }
      });
    }
  });

  if (editedFiles.size > 0) {
    suggestions.add(`Review changes in ${editedFiles.size} edited file(s) for consistency`);
  }

  // Check for test-related activity
  const hasTestActivity = messages.some(
    (msg) =>
      msg.content.toLowerCase().includes('test') ||
      msg.tools?.some((t) => t.name.includes('test') || (typeof t.input?.['command'] === 'string' && (t.input['command'] as string).includes('test')))
  );

  if (hasTestActivity && errorPatterns.has('test failure')) {
    suggestions.add('Run tests in verbose mode to see detailed failure information');
    suggestions.add('Check if tests are isolated (no shared state between tests)');
  }

  // Check for build errors
  if (errorPatterns.has('build error')) {
    suggestions.add('Clear build cache and try again');
    suggestions.add('Check for conflicting dependency versions');
  }

  // Check for repeated questions (confusion)
  const questionMessages = messages.filter(
    (msg) => msg.role === 'user' && msg.content.trim().endsWith('?')
  );

  if (questionMessages.length >= 3) {
    suggestions.add('Consider reviewing the documentation for the confused concepts');
    suggestions.add('Try breaking down the problem into smaller steps');
  }
}
