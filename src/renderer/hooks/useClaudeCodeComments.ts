/*
 * Path: /Users/ghost/Desktop/aiterminal/src/renderer/hooks/useClaudeCodeComments.ts
 * Module: renderer/hooks
 * Purpose: Context-aware voice comments that demonstrate understanding of Claude Code sessions
 * Dependencies: react, ./useContextAnalyzer
 * Related: /Users/ghost/Desktop/aiterminal/src/renderer/App.tsx, /Users/ghost/Desktop/aiterminal/src/renderer/hooks/useVoiceIO.ts
 * Keywords: claude-code, context-aware, comments, voice, tts, intelligent-feedback
 * Last Updated: 2026-03-26
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useContextAnalyzer } from './useContextAnalyzer';
import type { ClaudeCodeMessage } from '../../types';

interface CommentEvent {
  type: string;
  message: string;
  timestamp: number;
  priority: 'low' | 'medium' | 'high';
  context?: {
    tool?: string;
    file?: string;
    error?: string;
    framework?: string;
  };
}

interface UseClaudeCodeCommentsOptions {
  /** Minimum time between comments (ms) to avoid being too chatty */
  minCommentInterval?: number;
  /** Callback for when a comment is generated */
  onComment?: (comment: string) => void;
}

interface UseClaudeCodeCommentsReturn {
  /** Whether the comment system is active */
  isActive: boolean;
  /** Activate the comment system */
  activate: () => void;
  /** Deactivate the comment system */
  deactivate: () => void;
  /** Recent comments generated */
  recentComments: CommentEvent[];
  /** Clear comment history */
  clearHistory: () => void;
}

/**
 * Extract project context from Claude Code messages
 */
interface ProjectContext {
  /** Detected language/framework */
  framework?: string;
  /** Detected package manager */
  packageManager?: string;
  /** Project type inferred from tools/files */
  projectType?: string;
  /** Current task/goal inferred from conversation */
  currentTask?: string;
  /** Files being worked on */
  activeFiles: string[];
  /** Recent commands run */
  recentCommands: string[];
}

/**
 * Parse tool usage to understand what's happening
 */
function extractProjectContext(messages: ClaudeCodeMessage[]): ProjectContext {
  const context: ProjectContext = {
    activeFiles: [],
    recentCommands: [],
  };

  for (const msg of messages) {
    if (!msg.tools) continue;

    for (const tool of msg.tools) {
      switch (tool.name) {
        case 'bash':
          const cmd = typeof tool.input === 'object' && tool.input?.['command']
            ? String(tool.input['command'])
            : '';
          if (cmd) {
            context.recentCommands.push(cmd);

            // Detect package manager
            if (cmd.startsWith('npm ')) context.packageManager = 'npm';
            else if (cmd.startsWith('yarn ')) context.packageManager = 'yarn';
            else if (cmd.startsWith('pnpm ')) context.packageManager = 'pnpm';
            else if (cmd.startsWith('bun ')) context.packageManager = 'bun';
            else if (cmd.startsWith('pip ')) context.packageManager = 'pip';
            else if (cmd.startsWith('cargo ')) context.packageManager = 'cargo';
            else if (cmd.startsWith('go ')) context.packageManager = 'go';

            // Detect framework from commands
            if (cmd.includes('vite')) context.framework = 'Vite';
            else if (cmd.includes('webpack')) context.framework = 'Webpack';
            else if (cmd.includes('next')) context.framework = 'Next.js';
            else if (cmd.includes('react-scripts')) context.framework = 'Create React App';
            else if (cmd.includes('vue')) context.framework = 'Vue';
            else if (cmd.includes('svelte')) context.framework = 'Svelte';
            else if (cmd.includes('astro')) context.framework = 'Astro';
            else if (cmd.includes('pytest')) context.framework = 'pytest';
            else if (cmd.includes('jest')) context.framework = 'Jest';
            else if (cmd.includes('vitest')) context.framework = 'Vitest';
          }
          break;

        case 'write_to_file':
        case 'read_file':
          const filePath = typeof tool.input === 'object' && tool.input?.['file_path']
            ? String(tool.input['file_path'])
            : '';
          if (filePath && !context.activeFiles.includes(filePath)) {
            context.activeFiles.push(filePath);
          }

          // Detect project type from files
          if (filePath.includes('package.json')) {
            context.projectType = 'Node.js/JavaScript';
          } else if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
            context.projectType = 'TypeScript';
          } else if (filePath.endsWith('.jsx')) {
            context.projectType = 'React';
          } else if (filePath.endsWith('.vue')) {
            context.projectType = 'Vue';
          } else if (filePath.endsWith('.py')) {
            context.projectType = 'Python';
          } else if (filePath.endsWith('.go')) {
            context.projectType = 'Go';
          } else if (filePath.endsWith('.rs')) {
            context.projectType = 'Rust';
          } else if (filePath.includes('Dockerfile')) {
            context.projectType = 'Docker';
          } else if (filePath.includes('docker-compose')) {
            context.projectType = 'Docker Compose';
          }
          break;

        case 'search':
          // User is searching for something - trying to understand codebase
          context.currentTask = 'exploring codebase';
          break;
      }
    }
  }

  // Infer current task from user messages
  const userMessages = messages.filter(m => m.role === 'user');
  if (userMessages.length > 0) {
    const lastUserMsg = userMessages[userMessages.length - 1].content.toLowerCase();

    if (lastUserMsg.includes('build') || lastUserMsg.includes('compile')) {
      context.currentTask = 'building project';
    } else if (lastUserMsg.includes('test')) {
      context.currentTask = 'testing';
    } else if (lastUserMsg.includes('deploy')) {
      context.currentTask = 'deploying';
    } else if (lastUserMsg.includes('fix') || lastUserMsg.includes('bug')) {
      context.currentTask = 'debugging';
    } else if (lastUserMsg.includes('add') || lastUserMsg.includes('create') || lastUserMsg.includes('implement')) {
      context.currentTask = 'implementing feature';
    } else if (lastUserMsg.includes('refactor')) {
      context.currentTask = 'refactoring';
    } else if (lastUserMsg.includes('help') || lastUserMsg.includes('how do')) {
      context.currentTask = 'learning/exploring';
    }
  }

  return context;
}

/**
 * Generate contextual comment based on project context and recent activity
 */
function generateContextualComment(
  messages: ClaudeCodeMessage[],
  previousMessageCount: number,
  hasCommentedOnProject: boolean,
  context: ProjectContext,
  analysis: ReturnType<typeof useContextAnalyzer> extends { analyzeLog: any } ? any : null
): CommentEvent | null {
  const messageCount = messages.length;

  // NEW PROJECT DETECTION: First meaningful activity
  if (!hasCommentedOnProject && messageCount >= 3 && messageCount <= 8) {
    const hasBash = messages.some(m => m.tools?.some(t => t.name === 'bash'));
    const hasFileWrite = messages.some(m => m.tools?.some(t => t.name === 'write_to_file'));

    if (hasBash || hasFileWrite) {
      // Comment based on what we detected
      if (context.framework) {
        return {
          type: 'new-project',
          message: `Starting a ${context.framework} project! I'll watch your progress.`,
          timestamp: Date.now(),
          priority: 'high',
          context: { framework: context.framework },
        };
      } else if (context.projectType) {
        return {
          type: 'new-project',
          message: `Starting work on a ${context.projectType} project. Let me know if you need anything!`,
          timestamp: Date.now(),
          priority: 'high',
          context: { framework: context.projectType },
        };
      } else {
        // Look at what they're actually doing
        const firstUserMsg = messages.find(m => m.role === 'user');
        if (firstUserMsg) {
          const content = firstUserMsg.content.toLowerCase();
          if (content.includes('build') || content.includes('create')) {
            return {
              type: 'new-project',
              message: `Building something new! I'll follow along and help where I can.`,
              timestamp: Date.now(),
              priority: 'high',
            };
          }
        }
        return {
          type: 'new-project',
          message: `New session detected. What are we working on today?`,
          timestamp: Date.now(),
          priority: 'high',
        };
      }
    }
  }

  // FIRST COMMAND/ACTION: Context-specific comment on first real action
  if (previousMessageCount < 5 && messageCount >= 5 && context.recentCommands.length > 0) {
    const lastCommand = context.recentCommands[context.recentCommands.length - 1];

    // Comment on the specific action
    if (lastCommand.includes('install')) {
      const pkg = context.packageManager || 'package manager';
      return {
        type: 'first-command',
        message: `Installing dependencies with ${pkg}. This might take a moment.`,
        timestamp: Date.now(),
        priority: 'medium',
        context: { tool: lastCommand },
      };
    } else if (lastCommand.includes('dev') || lastCommand.includes('start')) {
      return {
        type: 'first-command',
        message: `Starting the dev server. Let's see if everything comes up cleanly.`,
        timestamp: Date.now(),
        priority: 'medium',
        context: { tool: lastCommand },
      };
    } else if (lastCommand.includes('test')) {
      return {
        type: 'first-command',
        message: `Running tests. Fingers crossed!`,
        timestamp: Date.now(),
        priority: 'medium',
        context: { tool: lastCommand },
      };
    } else if (lastCommand.includes('build')) {
      return {
        type: 'first-command',
        message: `Building the project. Hope there are no surprises.`,
        timestamp: Date.now(),
        priority: 'medium',
        context: { tool: lastCommand },
      };
    }
  }

  // FILE OPERATIONS: Comment on specific file work
  const recentFileOps = messages.filter(m =>
    m.tools?.some(t => t.name === 'write_to_file' || t.name === 'read_file')
  );
  if (recentFileOps.length > 0 && previousMessageCount > 0) {
    const lastFileOp = recentFileOps[recentFileOps.length - 1];
    const tool = lastFileOp.tools?.find(t => t.name === 'write_to_file' || t.name === 'read_file');

    if (tool && tool.input && typeof tool.input === 'object') {
      const filePath = String(tool.input['file_path'] || '');
      const fileName = filePath.split('/').pop() || filePath;

      // Only comment if it's a significant file and we haven't recently
      if (fileName.endsWith('.tsx') || fileName.endsWith('.ts') ||
          fileName.endsWith('.py') || fileName.endsWith('.go') ||
          fileName.endsWith('.rs')) {

        // Check if we commented on this file recently (avoid repetition)
        const timeSinceLastFileComment = Date.now() - (previousMessageCount * 1000);

        if (timeSinceLastFileComment > 60000) { // 1 minute
          if (tool.name === 'write_to_file') {
            return {
              type: 'file-operation',
              message: `Working on ${fileName}. Making progress!`,
              timestamp: Date.now(),
              priority: 'low',
              context: { file: fileName },
            };
          }
        }
      }
    }
  }

  // ERRORS: Specific, contextual error comments
  if (analysis && analysis.hasErrors && analysis.errorPatterns.length > 0) {
    const errorPattern = analysis.errorPatterns[analysis.errorPatterns.length - 1];

    // Map specific errors to helpful comments
    if (errorPattern.includes('command not found')) {
      const cmd = context.recentCommands[context.recentCommands.length - 1] || '';
      const cmdName = cmd.split(' ')[0] || 'command';
      return {
        type: 'error-detected',
        message: `Looks like ${cmdName} isn't installed. Might need to install that dependency.`,
        timestamp: Date.now(),
        priority: 'high',
        context: { error: errorPattern, tool: cmdName },
      };
    } else if (errorPattern.includes('permission denied')) {
      return {
        type: 'error-detected',
        message: `Permission issue. Maybe check ownership or permissions on that file.`,
        timestamp: Date.now(),
        priority: 'high',
        context: { error: errorPattern },
      };
    } else if (errorPattern.includes('module not found') || errorPattern.includes('cannot find module')) {
      return {
        type: 'error-detected',
        message: `Missing module. Probably need to install a dependency.`,
        timestamp: Date.now(),
        priority: 'high',
        context: { error: errorPattern },
      };
    } else if (errorPattern.includes('type error') || errorPattern.includes('typescript')) {
      return {
        type: 'error-detected',
        message: `TypeScript error. Probably a type mismatch somewhere.`,
        timestamp: Date.now(),
        priority: 'medium',
        context: { error: errorPattern },
      };
    } else if (errorPattern.includes('test failed')) {
      return {
        type: 'error-detected',
        message: `Test failure. Let's see what broke.`,
        timestamp: Date.now(),
        priority: 'medium',
        context: { error: errorPattern },
      };
    } else if (errorPattern.includes('port in use')) {
      return {
        type: 'error-detected',
        message: `Port's already in use. Something's already running on that port.`,
        timestamp: Date.now(),
        priority: 'medium',
        context: { error: errorPattern },
      };
    } else {
      return {
        type: 'error-detected',
        message: `Hit a ${errorPattern}. These things happen.`,
        timestamp: Date.now(),
        priority: 'high',
        context: { error: errorPattern },
      };
    }
  }

  // ACHIEVEMENTS: Context-aware celebration
  if (analysis && analysis.achievements.length > 0) {
    const achievement = analysis.achievements[analysis.achievements.length - 1];

    if (achievement.includes('test') && achievement.includes('pass')) {
      const testFramework = context.framework || 'tests';
      return {
        type: 'achievement',
        message: `${testFramework} passing! Nice work.`,
        timestamp: Date.now(),
        priority: 'low',
        context: { framework: testFramework },
      };
    } else if (achievement.includes('build') && achievement.includes('success')) {
      return {
        type: 'achievement',
        message: `Build succeeded! Ready to ship.`,
        timestamp: Date.now(),
        priority: 'low',
        context: { framework: context.framework },
      };
    } else if (achievement.includes('fix') || achievement.includes('resolved')) {
      return {
        type: 'achievement',
        message: `Got that sorted! Good debugging.`,
        timestamp: Date.now(),
        priority: 'low',
      };
    }
  }

  // STUCK USER: Helpful suggestions based on context
  if (analysis && analysis.isStuck && analysis.stuckSeverity !== 'none') {
    if (analysis.errorPatterns.length > 0) {
      const error = analysis.errorPatterns[0];
      return {
        type: 'stuck',
        message: `Seeing the same "${error}" error repeatedly. Want to try a different approach?`,
        timestamp: Date.now(),
        priority: 'high',
        context: { error },
      };
    } else {
      return {
        type: 'stuck',
        message: `Seems like we're going in circles. Maybe take a step back and rethink this?`,
        timestamp: Date.now(),
        priority: 'high',
      };
    }
  }

  return null;
}

/**
 * Hook for generating context-aware voice comments during Claude Code sessions
 *
 * This system demonstrates actual comprehension of:
 * - What framework/language you're using
 * - What tools/commands you're running
 * - What files you're editing
 * - What errors you're encountering
 * - What your current goal is
 */
export function useClaudeCodeComments(
  options: UseClaudeCodeCommentsOptions = {}
): UseClaudeCodeCommentsReturn {
  const {
    minCommentInterval = 15000, // 15 seconds default
    onComment,
  } = options;

  const { analyzeLog } = useContextAnalyzer();

  const [isActive, setIsActive] = useState(false);
  const [recentComments, setRecentComments] = useState<CommentEvent[]>([]);
  const [logMessages, setLogMessages] = useState<ClaudeCodeMessage[]>([]);

  // Track state for detection
  const previousMessageCount = useRef(0);
  const hasCommentedOnProject = useRef(false);
  const lastCommentTime = useRef(0);
  const lastErrorCount = useRef(0);
  const lastAchievementCount = useRef(0);
  const isActiveRef = useRef(isActive);

  // Keep ref in sync with state
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  /**
   * Generate a comment event
   */
  const generateComment = useCallback((
    comment: CommentEvent
  ) => {
    const now = Date.now();

    // Rate limiting check
    if (now - lastCommentTime.current < minCommentInterval) {
      console.log('[useClaudeCodeComments] Comment throttled (too soon)');
      return;
    }

    lastCommentTime.current = now;

    setRecentComments(prev => [comment, ...prev].slice(0, 10)); // Keep last 10
    onComment?.(comment.message);

    console.log('[useClaudeCodeComments] Generated comment:', {
      type: comment.type,
      message: comment.message,
      priority: comment.priority,
      context: comment.context,
    });
  }, [minCommentInterval, onComment]);

  /**
   * Analyze logs and generate appropriate comments
   */
  const analyzeAndComment = useCallback(() => {
    if (logMessages.length === 0) return;

    const analysis = analyzeLog(logMessages);
    if (!analysis) return;

    const messageCount = analysis.messageCount;

    // Extract rich project context
    const context = extractProjectContext(logMessages);

    // Generate contextual comment
    const comment = generateContextualComment(
      logMessages,
      previousMessageCount.current,
      hasCommentedOnProject.current,
      context,
      analysis
    );

    if (comment) {
      // Update tracking state
      if (comment.type === 'new-project') {
        hasCommentedOnProject.current = true;
      }

      generateComment(comment);
      previousMessageCount.current = messageCount;
    }
  }, [logMessages, analyzeLog, generateComment]);

  /**
   * Handle log updates from Claude Code watcher
   */
  useEffect(() => {
    if (!isActive) return;

    // Trigger analysis when logs update
    analyzeAndComment();
  }, [logMessages, isActive, analyzeAndComment]);

  /**
   * Subscribe to Claude Code log updates
   */
  useEffect(() => {
    if (!isActive) return;

    const setupWatcher = async () => {
      try {
        // Start the log watcher
        await window.electronAPI.startClaudeCodeLogWatcher();

        // Load initial messages
        const result = await window.electronAPI.getClaudeCodeLog(50);
        if (result.success && result.messages) {
          setLogMessages(result.messages);
        }

        // Subscribe to updates
        const unsubscribe = window.electronAPI.onClaudeCodeLogUpdated((data) => {
          if (data.messages) {
            setLogMessages(data.messages);
          }
        });

        return unsubscribe;
      } catch (error) {
        console.error('[useClaudeCodeComments] Failed to setup log watcher:', error);
        return () => {};
      }
    };

    let unsubscribe: (() => void) | null = null;

    setupWatcher().then((unsubFn) => {
      unsubscribe = unsubFn;
    });

    return () => {
      unsubscribe?.();
      window.electronAPI.stopClaudeCodeLogWatcher();
    };
  }, [isActive]);

  /**
   * Listen for Claude Code TUI entry and greet
   * IMPORTANT: This listener is set up once on mount (empty deps array)
   * to catch the event even if it fires before the hook is activated.
   * Uses isActiveRef to check current state without closure issues.
   */
  useEffect(() => {
    console.log('[useClaudeCodeComments] Setting up TUI event listener');
    const handleTuiEntered = () => {
      console.log('[useClaudeCodeComments] 🎉 claude-code-tui-entered event received!');
      console.log('[useClaudeCodeComments] isActiveRef.current:', isActiveRef.current);
      console.log('[useClaudeCodeComments] isActive state:', isActive);
      // Only greet if the comment system is active
      if (!isActiveRef.current) {
        console.log('[useClaudeCodeComments] ⚠️ Skipping greeting - not active yet');
        return;
      }
      console.log('[useClaudeCodeComments] ✅ Generating greeting comment');
      // Generate a greeting comment
      generateComment({
        type: 'tui-greeting',
        message: 'Hey Claude! Ready to code?',
        timestamp: Date.now(),
        priority: 'high',
      });
    };

    window.addEventListener('claude-code-tui-entered', handleTuiEntered);

    return () => {
      console.log('[useClaudeCodeComments] Cleaning up TUI event listener');
      window.removeEventListener('claude-code-tui-entered', handleTuiEntered);
    };
  }, [generateComment]); // Only depend on generateComment, not isActive

  /**
   * Activate the comment system
   */
  const activate = useCallback(() => {
    console.log('[useClaudeCodeComments] Activating');
    const wasActive = isActiveRef.current;
    setIsActive(true);

    // If this is a fresh activation (not already active), check if we should greet
    if (!wasActive) {
      // Small delay to ensure activation has propagated
      setTimeout(() => {
        // Check if Claude Code backend is active by looking for the TUI in DOM
        const hasTuiPattern = document.body.textContent.includes('\x1b[?1049h') ||
                             document.querySelector('.claude-tui-content');
        if (hasTuiPattern) {
          console.log('[useClaudeCodeComments] TUI detected on activation, greeting!');
          generateComment({
            type: 'tui-greeting',
            message: 'Hey Claude! Ready to code?',
            timestamp: Date.now(),
            priority: 'high',
          });
        }
      }, 200);
    }
  }, [isActive]);

  /**
   * Deactivate the comment system
   */
  const deactivate = useCallback(() => {
    console.log('[useClaudeCodeComments] Deactivating');
    setIsActive(false);
  }, []);

  /**
   * Clear comment history
   */
  const clearHistory = useCallback(() => {
    setRecentComments([]);
    hasCommentedOnProject.current = false;
    previousMessageCount.current = 0;
    lastErrorCount.current = 0;
    lastAchievementCount.current = 0;
  }, []);

  return {
    isActive,
    activate,
    deactivate,
    recentComments,
    clearHistory,
  };
}
