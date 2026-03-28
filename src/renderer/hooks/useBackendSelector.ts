import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Strip ANSI escape codes from text
 * This removes color codes, cursor positioning, and other terminal control sequences
 */
function stripAnsiCodes(text: string): string {
  // Remove ALL ANSI escape sequences including:
  // - CSI sequences: ESC [ ... (letter)
  // - OSC sequences: ESC ] ... BEL\ESC \
  // - Device control strings
  // - Cursor positioning, colors, screen modes, etc.
  return text
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '') // CSI sequences
    .replace(/\x1b\][?[^\x07\x1b]*[\x07\x1b\\]/g, '') // OSC sequences
    .replace(/\x1b[=>][^\x07\x1b]*[\x07\x1b\\]/g, '') // Device control
    .replace(/\x1b[\\-_^][^\x07\x1b]*[\x07\x1b\\]/g, '') // String terminators
    .replace(/\x1b[#34568]/g, '') // Line drawing, etc.
    .replace(/\x1b[%G8]/g, '') // Character sets
    .replace(/\x1b\[[0-9;]*[mGKHfABC]/g, '') // Legacy CSI (for safety)
    .replace(/\x1b\[[0-9;]*[mGKHfABCD]/g, '') // More CSI endings
    .replace(/\x1b\[[0-9;]*[mGKHfABCDnstul]/g, '') // Even more CSI endings
    .replace(/\x1b\??[0-9;]*[hnl]/g, '') // Private modes
    .replace(/\x1b\[[0-9;]*[Hf]/g, '') // Cursor position
    .replace(/\x1b\[>/g, '') // Key modifiers
    .replace(/\x1b]/g, '') // OSC starters (incomplete)
    .replace(/\x07/g, '') // BEL characters
    .replace(/\x1b\\/g, ''); // ESC \ (ST - String Terminator)
}

/**
 * Extract plain text content from Claude Code TUI output
 * Filters out common UI elements and preserves the actual response
 */
function extractContentFromTui(raw: string): string {
  const cleaned = stripAnsiCodes(raw);

  // Remove common UI noise
  const lines = cleaned.split('\n');
  const filtered = lines.filter(line => {
    // Skip empty lines
    if (!line.trim()) return false;

    // Skip common TUI elements
    const lower = line.toLowerCase();
    if (lower.includes('press') ||
        lower.includes('enter') ||
        lower.includes('type') ||
        lower.includes('─') ||
        lower.includes('│') ||
        line.match(/^[┌┐└┘│─]+$/)) {
      return false;
    }

    return true;
  });

  return filtered.join('\n').trim();
}

interface UseBackendSelectorReturn {
  activeBackend: 'openrouter' | 'claude-code';
  isClaudeCodeAvailable: boolean;
  isClaudeCodeRunning: boolean;
  claudeCodeStream: string;
  spawnClaudeCode: (args?: string[]) => Promise<boolean>;
  killClaudeCode: () => void;
  writeToClaudeCode: (input: string) => void;
  clearClaudeCodeStream: () => void;
  isWaitingForPermissions: boolean; // NEW: blocks input while accepting permissions
}

/**
 * Hook to detect and toggle between OpenRouter and Claude Code backends.
 *
 * Monitors PTY output for Claude Code invocation patterns and automatically
 * spawns the Claude Code process when detected. Manages backend state and
 * provides methods to control the Claude Code lifecycle.
 *
 * @param onBackendChange - Optional callback when backend switches
 * @returns Backend state and control methods
 */
export function useBackendSelector(
  onBackendChange?: (backend: 'openrouter' | 'claude-code') => void
): UseBackendSelectorReturn {
  const [activeBackend, setActiveBackend] = useState<'openrouter' | 'claude-code'>('openrouter');
  const activeBackendRef = useRef<'openrouter' | 'claude-code'>('openrouter');
  const [isClaudeCodeAvailable, setIsClaudeCodeAvailable] = useState(false);
  const [isClaudeCodeRunning, setIsClaudeCodeRunning] = useState(false);
  const [claudeCodeStream, setClaudeCodeStream] = useState('');
  const isWaitingForPermissionsRef = useRef(false);

  /** Set backend in both state (for React) and ref (for event listeners) */
  const setBackend = useCallback((backend: 'openrouter' | 'claude-code') => {
    activeBackendRef.current = backend;
    setActiveBackend(backend);
  }, []);

  // Track the Claude Code session ID for PTY writing
  const claudeCodeSessionIdRef = useRef<string | null>(null);

  // Track if we've already spawned for this detection to avoid duplicates
  const spawnLockRef = useRef(false);
  const detectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Check if Claude Code binary is available on the system
   */
  const checkClaudeCodeAvailability = useCallback(async (): Promise<boolean> => {
    try {
      // Try to check if Claude Code is running - if we can call the API, it's available
      await window.electronAPI.claudeCodeIsRunning?.();
      setIsClaudeCodeAvailable(true);
      return true;
    } catch (error) {
      console.error('Claude Code not available:', error);
      setIsClaudeCodeAvailable(false);
      return false;
    }
  }, []);

  /**
   * Spawn the Claude Code process
   */
  const spawnClaudeCode = useCallback(async (args?: string[]): Promise<boolean> => {
    if (isClaudeCodeRunning || spawnLockRef.current) {
      console.log('[useBackendSelector] Claude Code already spawning or running');
      return false;
    }

    spawnLockRef.current = true;

    try {
      console.log('[useBackendSelector] Spawning Claude Code with args:', args);
      const success = await window.electronAPI.claudeCodeSpawn?.(args ?? []) ?? false;

      if (success) {
        setIsClaudeCodeRunning(true);
        setBackend('claude-code');
        onBackendChange?.('claude-code');
        console.log('[useBackendSelector] Claude Code spawned successfully');
      } else {
        console.error('[useBackendSelector] Failed to spawn Claude Code');
      }

      return success;
    } catch (error) {
      console.error('[useBackendSelector] Error spawning Claude Code:', error);
      return false;
    } finally {
      // Reset lock after a short delay to prevent rapid retries
      setTimeout(() => {
        spawnLockRef.current = false;
      }, 1000);
    }
  }, [isClaudeCodeRunning, onBackendChange]);

  /**
   * Kill the Claude Code process
   */
  const killClaudeCode = useCallback(() => {
    if (!isClaudeCodeRunning) {
      console.log('[useBackendSelector] Claude Code not running');
      return;
    }

    try {
      console.log('[useBackendSelector] Killing Claude Code');
      window.electronAPI.claudeCodeKill?.();
      setIsClaudeCodeRunning(false);
      setBackend('openrouter');
      setClaudeCodeStream('');
      onBackendChange?.('openrouter');
    } catch (error) {
      console.error('[useBackendSelector] Error killing Claude Code:', error);
    }
  }, [isClaudeCodeRunning, onBackendChange]);

  /**
   * Write input to Claude Code process (via PTY when TUI is active)
   */
  const writeToClaudeCode = useCallback((input: string) => {
    if (!isClaudeCodeRunning) {
      console.warn('[useBackendSelector] Cannot write: Claude Code not running');
      return;
    }

    const sessionId = claudeCodeSessionIdRef.current;
    if (!sessionId) {
      console.error('[useBackendSelector] ❌ No Claude Code session ID available');
      return;
    }

    try {
      console.log('[useBackendSelector] 🚀 Sending to Claude Code:', input);
      console.log('[useBackendSelector] 📍 Using session ID:', sessionId);
      // CRITICAL: Use writeToSession with the actual session ID
      // writeToPty only writes to 'legacy' session, but Claude Code is in a different session
      window.electronAPI.writeToSession?.(sessionId, input + '\n');
      console.log('[useBackendSelector] ✅ Sent via writeToSession');
      // Clear stream when sending new input
      setClaudeCodeStream('');
    } catch (error) {
      console.error('[useBackendSelector] ❌ Error writing to Claude Code:', error);
    }
  }, [isClaudeCodeRunning]);

  /**
   * Clear the Claude Code stream
   */
  const clearClaudeCodeStream = useCallback(() => {
    setClaudeCodeStream('');
  }, []);

  /**
   * Monitor PTY output for Claude Code TUI detection
   */
  useEffect(() => {
    // Check availability on mount
    checkClaudeCodeAvailability();

    // Subscribe to ALL session data events (not just legacy)
    const unsubscribe = window.electronAPI.onAnySessionData?.((sessionId, data) => {
      const text = typeof data === 'string' ? data : String(data);
      // Log for debugging TUI detection
      if (text.includes('\x1b[') || text.includes('claude') || text.includes('Claude') || text.toLowerCase().includes('would you like') || text.toLowerCase().includes('continue')) {
        console.log('[useBackendSelector] PTY data from', sessionId, ':', text.substring(0, 200).replace(/\x1b/g, '\\x1b'));
      }

      // Auto-accept permissions prompt when using --dangerously-skip-permissions
      // Strip ANSI codes before matching to ensure patterns work
      const cleanText = stripAnsiCodes(text);

      // Check for various prompt patterns
      const permissionsPatterns = [
        /Press Enter to continue/i,
        /Would you like to continue/i,
        /Accept permissions/i,
        /Continue with these permissions/i,
        /Allow Claude Code to/i,
        /Grant access/i,
        /Permission required/i
      ];

      for (const pattern of permissionsPatterns) {
        if (pattern.test(cleanText)) {
          console.log('[useBackendSelector] 🤖 Auto-accepting permissions prompt:', text.substring(0, 100));
          console.log('[useBackendSelector] 🎯 Pattern matched:', pattern);
          console.log('[useBackendSelector] 📍 Session ID:', sessionId);
          console.log('[useBackendSelector] 🧹 Cleaned text:', cleanText.substring(0, 100));
          // CRITICAL: Update the session ID whenever we see a permissions prompt
          claudeCodeSessionIdRef.current = sessionId;
          console.log('[useBackendSelector] 🔄 Updated claudeCodeSessionIdRef to:', sessionId);
          isWaitingForPermissionsRef.current = true;
          // Shorter delay - send Enter immediately when we see the prompt
          setTimeout(() => {
            console.log('[useBackendSelector] 📤 Sending Enter to session:', sessionId);
            window.electronAPI.writeToSession?.(sessionId, '\n');
            console.log('[useBackendSelector] 📤 Enter sent');
            // Wait a bit for the accept to process
            setTimeout(() => {
              isWaitingForPermissionsRef.current = false;
              console.log('[useBackendSelector] ✅ Permissions accepted, ready for input');
            }, 1000);
          }, 500); // Reduced from 800ms to 500ms for faster response
          break;
        }
      }

      // Check for Claude Code TUI entry (alternative screen buffer on)
      const tuiEnterPattern = /\x1b\[\?1049h/;
      const claudeCodePattern = /(Claude|claude).*Code|(Welcome to|Welcome back).*Claude/i;

      if (tuiEnterPattern.test(text)) {
        console.log('[useBackendSelector] ✅ TUI pattern detected! Claude Code entered in session', sessionId);
        claudeCodeSessionIdRef.current = sessionId;
        if (activeBackendRef.current !== 'claude-code') {
          console.log('[useBackendSelector] Switching backend to claude-code');
          setBackend('claude-code');
          setIsClaudeCodeRunning(true);
          setClaudeCodeStream(''); // Clear previous stream
          onBackendChange?.('claude-code');

          // Auto-accept permissions prompt after 2 seconds (to give time for initial prompt to appear)
          console.log('[useBackendSelector] ⏰ Scheduling auto-accept in 2 seconds');
          setTimeout(() => {
            console.log('[useBackendSelector] 🤖 Sending Enter to accept permissions');
            window.electronAPI.writeToSession?.(sessionId, '\n');
            console.log('[useBackendSelector] 📤 Enter sent via writeToSession');
          }, 2000);

          // Dispatch greeting event after state update
          // Use multiple techniques to ensure it fires after hook activation
          requestAnimationFrame(() => {
            setTimeout(() => {
              console.log('[useBackendSelector] 🎯 Dispatching TUI greeting event');
              window.dispatchEvent(new CustomEvent('claude-code-tui-entered', {
                detail: { timestamp: Date.now() }
              }));
            }, 150);
          });
        }
      } else if (claudeCodePattern.test(text) && activeBackendRef.current !== 'claude-code') {
        console.log('[useBackendSelector] ✅ Claude Code detected by text pattern in session', sessionId);
        claudeCodeSessionIdRef.current = sessionId;
        setBackend('claude-code');
        setIsClaudeCodeRunning(true);
        setClaudeCodeStream('');
        onBackendChange?.('claude-code');

        // Auto-accept permissions prompt after 3 seconds
        console.log('[useBackendSelector] ⏰ Scheduling auto-accept in 3 seconds (text pattern)');
        setTimeout(() => {
          console.log('[useBackendSelector] 🤖 Sending Enter to accept permissions (text pattern)');
          window.electronAPI.writeToSession?.(sessionId, '\n');
          console.log('[useBackendSelector] 📤 Enter sent via writeToSession (text pattern)');
        }, 3000);

        requestAnimationFrame(() => {
          setTimeout(() => {
            console.log('[useBackendSelector] 🎯 Dispatching TUI greeting event (text pattern)');
            window.dispatchEvent(new CustomEvent('claude-code-tui-entered', {
              detail: { timestamp: Date.now() }
            }));
          }, 150);
        });
      }

      // Check for Claude Code TUI exit (alternative screen buffer off)
      const tuiExitPattern = /\x1b\[\?1049l/;
      if (tuiExitPattern.test(text) && activeBackendRef.current === 'claude-code') {
        console.log('[useBackendSelector] Claude Code TUI exited from session', sessionId);
        setBackend('openrouter');
        setIsClaudeCodeRunning(false);
        setClaudeCodeStream('');
        onBackendChange?.('openrouter');
      }
    }) || window.electronAPI.onPtyData?.((data) => {
      const text = typeof data === 'string' ? data : String(data);
      console.log('[useBackendSelector] Legacy PTY data:', text.substring(0, 100));

      const tuiEnterPattern = /\x1b\[\?1049h/;
      const claudeCodePattern = /(Claude|claude).*Code|(Welcome to|Welcome back).*Claude/i;

      if (tuiEnterPattern.test(text)) {
        console.log('[useBackendSelector] Claude Code TUI entered (legacy)');
        if (activeBackendRef.current !== 'claude-code') {
          setBackend('claude-code');
          setIsClaudeCodeRunning(true);
          setClaudeCodeStream('');
          onBackendChange?.('claude-code');

          // Auto-accept permissions prompt after 3 seconds
          console.log('[useBackendSelector] ⏰ Scheduling auto-accept in 3 seconds (legacy)');
          setTimeout(() => {
            console.log('[useBackendSelector] 🤖 Sending Enter to accept permissions (legacy)');
            window.electronAPI.writeToPty?.('\n');
            console.log('[useBackendSelector] 📤 Enter sent (legacy)');
          }, 3000);

          // Dispatch greeting event after state update
          requestAnimationFrame(() => {
            setTimeout(() => {
              console.log('[useBackendSelector] 🎯 Dispatching TUI greeting event (legacy)');
              window.dispatchEvent(new CustomEvent('claude-code-tui-entered', {
                detail: { timestamp: Date.now() }
              }));
            }, 150);
          });
        }
      } else if (claudeCodePattern.test(text) && activeBackendRef.current !== 'claude-code') {
        console.log('[useBackendSelector] Claude Code detected by text pattern (legacy)');
        setBackend('claude-code');
        setIsClaudeCodeRunning(true);
        setClaudeCodeStream('');
        onBackendChange?.('claude-code');

        // Auto-accept permissions prompt after 3 seconds
        console.log('[useBackendSelector] ⏰ Scheduling auto-accept in 3 seconds (legacy text pattern)');
        setTimeout(() => {
          console.log('[useBackendSelector] 🤖 Sending Enter to accept permissions (legacy text pattern)');
          window.electronAPI.writeToPty?.('\n');
          console.log('[useBackendSelector] 📤 Enter sent');
        }, 3000);

        requestAnimationFrame(() => {
          setTimeout(() => {
            console.log('[useBackendSelector] 🎯 Dispatching TUI greeting event (legacy text pattern)');
            window.dispatchEvent(new CustomEvent('claude-code-tui-entered', {
              detail: { timestamp: Date.now() }
            }));
          }, 150);
        });
      }

      const tuiExitPattern = /\x1b\[\?1049l/;
      if (tuiExitPattern.test(text) && activeBackendRef.current === 'claude-code') {
        console.log('[useBackendSelector] Claude Code TUI exited (legacy)');
        setBackend('openrouter');
        setIsClaudeCodeRunning(false);
        setClaudeCodeStream('');
        onBackendChange?.('openrouter');
      }
    });

    return () => {
      unsubscribe?.();
      if (detectionTimeoutRef.current) {
        clearTimeout(detectionTimeoutRef.current);
      }
    };
  }, [checkClaudeCodeAvailability, onBackendChange, setBackend]);

  /**
   * Listen to Claude Code process events
   */
  useEffect(() => {
    const unsubscribeOutput = window.electronAPI.onClaudeCodeOutput?.((data) => {
      console.log('[useBackendSelector] Claude Code output:', data);
      // Extract clean content from TUI output
      const cleanContent = extractContentFromTui(data);
      setClaudeCodeStream(prev => {
        // If this looks like a new response starting (user prompt), clear previous
        if (data.includes('>') || data.includes('?')) {
          return cleanContent;
        }
        return prev + (prev && cleanContent ? '\n' : '') + cleanContent;
      });
    });

    const unsubscribeError = window.electronAPI.onClaudeCodeError?.((error) => {
      console.error('[useBackendSelector] Claude Code error:', error);
    });

    const unsubscribeClose = window.electronAPI.onClaudeCodeClose?.((code) => {
      console.log('[useBackendSelector] Claude Code closed with code:', code);
      setIsClaudeCodeRunning(false);
      setBackend('openrouter');
      setClaudeCodeStream('');
      onBackendChange?.('openrouter');
    });

    return () => {
      unsubscribeOutput?.();
      unsubscribeError?.();
      unsubscribeClose?.();
    };
  }, [onBackendChange]);

  /**
   * Clear stream when switching away from Claude Code backend
   */
  useEffect(() => {
    if (activeBackend === 'openrouter') {
      setClaudeCodeStream('');
    }
  }, [activeBackend]);

  return {
    activeBackend,
    isClaudeCodeAvailable,
    isClaudeCodeRunning,
    claudeCodeStream,
    spawnClaudeCode,
    killClaudeCode,
    writeToClaudeCode,
    clearClaudeCodeStream,
    isWaitingForPermissions: isWaitingForPermissionsRef.current,
  };
}
