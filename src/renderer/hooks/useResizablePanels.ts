import { useState, useCallback, useEffect, useRef } from 'react';

/**
 * Options for useResizablePanels hook
 */
export interface UseResizablePanelsOptions {
  /** localStorage key for persistence */
  storageKey?: string;
  /** Default sizes for each panel (in pixels) */
  defaultSizes: Record<string, number>;
  /** Minimum sizes for each panel (optional) */
  minSizes?: Record<string, number>;
  /** Maximum sizes for each panel (optional) */
  maxSizes?: Record<string, number>;
  /** Debounce delay for localStorage writes (ms, default: 100ms) */
  debounceMs?: number;
}

/**
 * Return value for useResizablePanels hook
 */
export interface UseResizablePanelsReturn {
  /** Current sizes for all panels */
  sizes: Record<string, number>;
  /** Update a panel size by adding delta */
  updateSize: (panelId: string, delta: number) => void;
  /** Set a panel size to an absolute value */
  setSize: (panelId: string, size: number) => void;
  /** Reset a panel to its default size */
  resetSize: (panelId: string) => void;
  /** Reset all panels to their default sizes */
  resetAll: () => void;
}

/**
 * Load panel sizes from localStorage
 */
function loadFromStorage(
  storageKey: string | undefined,
  defaultSizes: Record<string, number>
): Record<string, number> | null {
  if (!storageKey || typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored);
    // Validate that all required keys exist
    for (const key of Object.keys(defaultSizes)) {
      if (typeof parsed[key] !== 'number') {
        return null;
      }
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Save panel sizes to localStorage
 */
function saveToStorage(
  storageKey: string | undefined,
  sizes: Record<string, number>
): void {
  if (!storageKey || typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(storageKey, JSON.stringify(sizes));
  } catch {
    // Silently fail if localStorage is full or disabled
  }
}

/**
 * Clamp a value between min and max
 */
function clampValue(
  value: number,
  min?: number,
  max?: number
): number {
  let clamped = value;
  if (min !== undefined) {
    clamped = Math.max(clamped, min);
  }
  if (max !== undefined) {
    clamped = Math.min(clamped, max);
  }
  return clamped;
}

/**
 * React hook for managing resizable panel state
 *
 * Provides state management for multiple resizable panels with:
 * - localStorage persistence
 * - Min/max size constraints
 * - Debounced storage writes
 * - Delta-based updates for drag handlers
 *
 * @example
 * ```tsx
 * const { sizes, updateSize } = useResizablePanels({
 *   storageKey: 'aiterminal-panel-sizes',
 *   defaultSizes: {
 *     leftSidebar: 250,
 *     rightSidebar: 400,
 *   },
 *   minSizes: {
 *     leftSidebar: 200,
 *     rightSidebar: 300,
 *   },
 * });
 *
 * // In a resize handle component:
 * const handleDrag = (delta: number) => {
 *   updateSize('rightSidebar', delta);
 * };
 * ```
 */
export function useResizablePanels({
  storageKey,
  defaultSizes,
  minSizes,
  maxSizes,
  debounceMs = 100,
}: UseResizablePanelsOptions): UseResizablePanelsReturn {
  // Initialize sizes from localStorage or defaults
  const [sizes, setSizes] = useState<Record<string, number>>(() => {
    const stored = loadFromStorage(storageKey, defaultSizes);
    if (stored) {
      // Clamp stored values to current min/max constraints
      const clamped: Record<string, number> = {};
      for (const [key, value] of Object.entries(stored)) {
        clamped[key] = clampValue(value, minSizes?.[key], maxSizes?.[key]);
      }
      return clamped;
    }
    return { ...defaultSizes };
  });

  // Debounced storage write
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSizesRef = useRef<Record<string, number> | null>(null);

  // Persist sizes to localStorage (debounced)
  useEffect(() => {
    if (pendingSizesRef.current) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        saveToStorage(storageKey, pendingSizesRef.current!);
        pendingSizesRef.current = null;
        debounceTimerRef.current = null;
      }, debounceMs);

      return () => {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
      };
    }
  }, [sizes, storageKey, debounceMs]);

  // Update pending sizes for debounced storage write
  useEffect(() => {
    pendingSizesRef.current = sizes;
  }, [sizes]);

  /**
   * Update a panel size by adding a delta value
   * Useful for drag handlers where you have the drag distance
   */
  const updateSize = useCallback(
    (panelId: string, delta: number) => {
      setSizes((prev) => {
        const currentSize = prev[panelId] ?? defaultSizes[panelId];
        const newSize = clampValue(
          currentSize + delta,
          minSizes?.[panelId],
          maxSizes?.[panelId]
        );

        return {
          ...prev,
          [panelId]: newSize,
        };
      });
    },
    [defaultSizes, minSizes, maxSizes]
  );

  /**
   * Set a panel size to an absolute value
   */
  const setSize = useCallback(
    (panelId: string, size: number) => {
      setSizes((prev) => ({
        ...prev,
        [panelId]: clampValue(size, minSizes?.[panelId], maxSizes?.[panelId]),
      }));
    },
    [minSizes, maxSizes]
  );

  /**
   * Reset a panel to its default size
   */
  const resetSize = useCallback((panelId: string) => {
    setSizes((prev) => ({
      ...prev,
      [panelId]: defaultSizes[panelId],
    }));
  }, [defaultSizes]);

  /**
   * Reset all panels to their default sizes
   */
  const resetAll = useCallback(() => {
    setSizes({ ...defaultSizes });
  }, [defaultSizes]);

  return {
    sizes,
    updateSize,
    setSize,
    resetSize,
    resetAll,
  };
}
