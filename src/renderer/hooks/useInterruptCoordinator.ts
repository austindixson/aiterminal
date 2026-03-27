import { useRef, useCallback, useEffect } from 'react';

/**
 * Interrupt priority levels
 */
export type InterruptPriority = 'critical' | 'high' | 'medium' | 'low';

/**
 * Interrupt timing configuration
 */
interface InterruptTiming {
  delay: number;      // Milliseconds to wait before interrupting
  probability: number; // 0-1 chance of interrupting (for non-critical)
}

/**
 * State tracking for interrupt coordination
 */
interface InterruptState {
  lastInterruptTime: number;
  interruptCount: number;
  userMessageCount: number;
  errorCount: number;
  lastErrorTime: number;
  lastError: string | null;
  consecutiveErrors: number;
  contextRelevance: number; // 0-1 score
}

/**
 * Configuration for interrupt throttling
 */
const CONFIG = {
  MIN_INTERRUPT_INTERVAL: 30000, // 30 seconds minimum between interrupts
  MAX_INTERRUPTS_PER_PERIOD: 3,   // Max 3 interrupts
  PERIOD_WINDOW: 300000,          // 5 minutes rolling window
  ERROR_STUCK_THRESHOLD: 120000,  // 2 minutes - consider user stuck
  IDLE_THRESHOLD: 60000,          // 1 minute of inactivity = idle
  CRITICAL_IMMEDIATE_DELAY: 0,    // Interrupt immediately for critical
  HIGH_MAX_DELAY: 10000,          // Within 10 seconds for high
  MEDIUM_MAX_DELAY: 60000,        // Within 1 minute for medium
  LOW_MAX_DELAY: 120000,          // Within 2 minutes for low
  HIGH_PROBABILITY: 1.0,          // Always interrupt for high
  MEDIUM_PROBABILITY: 0.3,        // 30% chance for medium
  LOW_PROBABILITY: 0.1,           // 10% chance for low
  LOW_IDLE_ONLY: true,            // Low priority only when idle
};

/**
 * Hook for coordinating AI intern interruptions
 *
 * Manages when the AI should interject with comments to avoid spamming
 * while still being helpful. Implements throttling, priority scoring,
 * and context-aware timing.
 *
 * @returns Interface for checking and recording interrupts
 */
export function useInterruptCoordinator(): {
  canInterrupt: (priority: InterruptPriority) => boolean;
  recordInterrupt: () => void;
  recordUserActivity: () => void;
  recordError: (error: string) => void;
  getOptimalTiming: (priority: InterruptPriority) => InterruptTiming;
  reset: () => void;
  getState: () => InterruptState;
} {
  // Track interrupt state
  const stateRef = useRef<InterruptState>({
    lastInterruptTime: 0,
    interruptCount: 0,
    userMessageCount: 0,
    errorCount: 0,
    lastErrorTime: 0,
    lastError: null,
    consecutiveErrors: 0,
    contextRelevance: 0.5,
  });

  // Track interrupt history for rolling window
  const interruptHistoryRef = useRef<number[]>([]);

  // Track last user activity
  const lastActivityRef = useRef<number>(Date.now());

  /**
   * Clean old interrupts from history (outside rolling window)
   */
  const cleanOldInterrupts = useCallback(() => {
    const now = Date.now();
    const cutoff = now - CONFIG.PERIOD_WINDOW;
    interruptHistoryRef.current = interruptHistoryRef.current.filter(
      (time) => time > cutoff
    );
  }, []);

  /**
   * Check if user appears stuck on an error
   */
  const isUserStuck = useCallback((): boolean => {
    const state = stateRef.current;
    const now = Date.now();

    // Check if stuck on same error for threshold time
    if (
      state.consecutiveErrors >= 2 &&
      state.lastErrorTime > 0 &&
      now - state.lastErrorTime >= CONFIG.ERROR_STUCK_THRESHOLD
    ) {
      return true;
    }

    return false;
  }, []);

  /**
   * Check if user appears idle
   */
  const isUserIdle = useCallback((): boolean => {
    const now = Date.now();
    return now - lastActivityRef.current >= CONFIG.IDLE_THRESHOLD;
  }, []);

  /**
   * Calculate context relevance score (0-1)
   * Based on recent activity, errors, and interrupt frequency
   */
  const calculateContextRelevance = useCallback((): number => {
    const state = stateRef.current;
    const now = Date.now();
    const timeSinceLastInterrupt = now - state.lastInterruptTime;

    // Base relevance
    let relevance = 0.5;

    // Increase relevance if user seems stuck
    if (isUserStuck()) {
      relevance += 0.3;
    }

    // Increase relevance with consecutive errors
    relevance += Math.min(state.consecutiveErrors * 0.1, 0.2);

    // Decrease relevance if we've interrupted recently
    if (timeSinceLastInterrupt < CONFIG.MIN_INTERRUPT_INTERVAL) {
      relevance -= 0.3;
    }

    // Decrease relevance if we've hit max interrupts
    if (interruptHistoryRef.current.length >= CONFIG.MAX_INTERRUPTS_PER_PERIOD) {
      relevance -= 0.2;
    }

    // Clamp to [0, 1]
    return Math.max(0, Math.min(1, relevance));
  }, [isUserStuck]);

  /**
   * Check if an interrupt is allowed based on throttling rules
   */
  const canInterrupt = useCallback(
    (priority: InterruptPriority): boolean => {
      const state = stateRef.current;
      const now = Date.now();

      // Clean old interrupts from history
      cleanOldInterrupts();

      // CRITICAL: bypass most throttling, but still respect very recent interrupts
      if (priority === 'critical') {
        const timeSinceLastInterrupt = now - state.lastInterruptTime;
        // Allow critical interrupts if at least 10 seconds have passed
        return timeSinceLastInterrupt >= 10000;
      }

      // Check minimum interval
      const timeSinceLastInterrupt = now - state.lastInterruptTime;
      if (timeSinceLastInterrupt < CONFIG.MIN_INTERRUPT_INTERVAL) {
        return false;
      }

      // Check max interrupts per period
      if (interruptHistoryRef.current.length >= CONFIG.MAX_INTERRUPTS_PER_PERIOD) {
        return false;
      }

      // LOW priority: only when idle
      if (priority === 'low' && CONFIG.LOW_IDLE_ONLY && !isUserIdle()) {
        return false;
      }

      // Update context relevance
      stateRef.current.contextRelevance = calculateContextRelevance();

      // MEDIUM and LOW: respect probability
      if (priority === 'medium') {
        return Math.random() < CONFIG.MEDIUM_PROBABILITY;
      }

      if (priority === 'low') {
        return Math.random() < CONFIG.LOW_PROBABILITY;
      }

      // HIGH: always allow if throttling checks pass
      return true;
    },
    [cleanOldInterrupts, isUserIdle, calculateContextRelevance]
  );

  /**
   * Record that an interrupt occurred
   */
  const recordInterrupt = useCallback(() => {
    const now = Date.now();
    stateRef.current.lastInterruptTime = now;
    stateRef.current.interruptCount += 1;
    interruptHistoryRef.current.push(now);

    // Reset consecutive errors after interrupt (we tried to help)
    stateRef.current.consecutiveErrors = 0;
  }, []);

  /**
   * Record user activity (message, command, etc.)
   */
  const recordUserActivity = useCallback(() => {
    stateRef.current.userMessageCount += 1;
    lastActivityRef.current = Date.now();
  }, []);

  /**
   * Record an error occurrence
   */
  const recordError = useCallback((error: string) => {
    const state = stateRef.current;
    const now = Date.now();

    state.errorCount += 1;
    state.lastErrorTime = now;

    // Check if this is the same error as before
    if (state.lastError === error) {
      state.consecutiveErrors += 1;
    } else {
      state.lastError = error;
      state.consecutiveErrors = 1;
    }

    lastActivityRef.current = now;
  }, []);

  /**
   * Get optimal timing for an interrupt
   */
  const getOptimalTiming = useCallback(
    (priority: InterruptPriority): InterruptTiming => {
      // CRITICAL: immediate
      if (priority === 'critical' || isUserStuck()) {
        return {
          delay: CONFIG.CRITICAL_IMMEDIATE_DELAY,
          probability: 1.0,
        };
      }

      // HIGH: quickly but with slight randomness for natural feel
      if (priority === 'high') {
        return {
          delay: Math.random() * CONFIG.HIGH_MAX_DELAY,
          probability: CONFIG.HIGH_PROBABILITY,
        };
      }

      // MEDIUM: moderate delay
      if (priority === 'medium') {
        return {
          delay: Math.random() * CONFIG.MEDIUM_MAX_DELAY,
          probability: CONFIG.MEDIUM_PROBABILITY * stateRef.current.contextRelevance,
        };
      }

      // LOW: longer delay, lower probability
      return {
        delay: Math.random() * CONFIG.LOW_MAX_DELAY,
        probability: CONFIG.LOW_PROBABILITY * stateRef.current.contextRelevance,
      };
    },
    [isUserStuck]
  );

  /**
   * Reset all state (for testing or manual reset)
   */
  const reset = useCallback(() => {
    stateRef.current = {
      lastInterruptTime: 0,
      interruptCount: 0,
      userMessageCount: 0,
      errorCount: 0,
      lastErrorTime: 0,
      lastError: null,
      consecutiveErrors: 0,
      contextRelevance: 0.5,
    };
    interruptHistoryRef.current = [];
    lastActivityRef.current = Date.now();
  }, []);

  /**
   * Get current state (for debugging/monitoring)
   */
  const getState = useCallback((): InterruptState => {
    return { ...stateRef.current };
  }, []);

  // Auto-cleanup old interrupts periodically
  useEffect(() => {
    const interval = setInterval(() => {
      cleanOldInterrupts();
    }, 60000); // Every minute

    return () => clearInterval(interval);
  }, [cleanOldInterrupts]);

  return {
    canInterrupt,
    recordInterrupt,
    recordUserActivity,
    recordError,
    getOptimalTiming,
    reset,
    getState,
  };
}
