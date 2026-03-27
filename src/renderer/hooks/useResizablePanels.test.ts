import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useResizablePanels } from './useResizablePanels';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
});

describe('useResizablePanels', () => {
  const mockStorageKey = 'test-panel-sizes';
  const defaultSizes = {
    leftSidebar: 250,
    rightSidebar: 400,
    main: 800,
  };

  const minSizes = {
    leftSidebar: 200,
    rightSidebar: 300,
  };

  const maxSizes = {
    leftSidebar: 400,
    rightSidebar: 600,
  };

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('should initialize with default sizes', () => {
    const { result } = renderHook(() =>
      useResizablePanels({
        defaultSizes,
      })
    );

    expect(result.current.sizes).toEqual(defaultSizes);
  });

  it('should load from localStorage if available', () => {
    const storedSizes = {
      leftSidebar: 300,
      rightSidebar: 500,
      main: 900,
    };

    localStorage.setItem(mockStorageKey, JSON.stringify(storedSizes));

    const { result } = renderHook(() =>
      useResizablePanels({
        storageKey: mockStorageKey,
        defaultSizes,
      })
    );

    expect(result.current.sizes).toEqual(storedSizes);
  });

  it('should clamp stored values to min/max constraints', () => {
    const storedSizes = {
      leftSidebar: 150, // Below min
      rightSidebar: 700, // Above max
      main: 800,
    };

    localStorage.setItem(mockStorageKey, JSON.stringify(storedSizes));

    const { result } = renderHook(() =>
      useResizablePanels({
        storageKey: mockStorageKey,
        defaultSizes,
        minSizes,
        maxSizes,
      })
    );

    expect(result.current.sizes.leftSidebar).toBe(200); // Clamped to min
    expect(result.current.sizes.rightSidebar).toBe(600); // Clamped to max
    expect(result.current.sizes.main).toBe(800); // No constraints
  });

  it('should update size with delta', () => {
    const { result } = renderHook(() =>
      useResizablePanels({
        defaultSizes,
        minSizes,
        maxSizes,
      })
    );

    act(() => {
      result.current.updateSize('leftSidebar', 50);
    });

    expect(result.current.sizes.leftSidebar).toBe(300);
  });

  it('should clamp delta updates to min/max', () => {
    const { result } = renderHook(() =>
      useResizablePanels({
        defaultSizes,
        minSizes,
        maxSizes,
      })
    );

    // Try to go below minimum
    act(() => {
      result.current.updateSize('leftSidebar', -100);
    });

    expect(result.current.sizes.leftSidebar).toBe(200); // Clamped to min

    // Try to go above maximum
    act(() => {
      result.current.updateSize('rightSidebar', 300);
    });

    expect(result.current.sizes.rightSidebar).toBe(600); // Clamped to max
  });

  it('should set absolute size', () => {
    const { result } = renderHook(() =>
      useResizablePanels({
        defaultSizes,
        minSizes,
        maxSizes,
      })
    );

    act(() => {
      result.current.setSize('leftSidebar', 350);
    });

    expect(result.current.sizes.leftSidebar).toBe(350);
  });

  it('should clamp absolute size to min/max', () => {
    const { result } = renderHook(() =>
      useResizablePanels({
        defaultSizes,
        minSizes,
        maxSizes,
      })
    );

    act(() => {
      result.current.setSize('leftSidebar', 150);
    });

    expect(result.current.sizes.leftSidebar).toBe(200); // Clamped to min

    act(() => {
      result.current.setSize('rightSidebar', 700);
    });

    expect(result.current.sizes.rightSidebar).toBe(600); // Clamped to max
  });

  it('should reset individual panel size', () => {
    const { result } = renderHook(() =>
      useResizablePanels({
        defaultSizes,
        minSizes,
        maxSizes,
      })
    );

    act(() => {
      result.current.setSize('leftSidebar', 350);
    });

    expect(result.current.sizes.leftSidebar).toBe(350);

    act(() => {
      result.current.resetSize('leftSidebar');
    });

    expect(result.current.sizes.leftSidebar).toBe(250); // Back to default
  });

  it('should reset all panel sizes', () => {
    const { result } = renderHook(() =>
      useResizablePanels({
        defaultSizes,
        minSizes,
        maxSizes,
      })
    );

    act(() => {
      result.current.setSize('leftSidebar', 350);
      result.current.setSize('rightSidebar', 500);
      result.current.setSize('main', 1000);
    });

    expect(result.current.sizes.leftSidebar).toBe(350);
    expect(result.current.sizes.rightSidebar).toBe(500);
    expect(result.current.sizes.main).toBe(1000);

    act(() => {
      result.current.resetAll();
    });

    expect(result.current.sizes).toEqual(defaultSizes);
  });

  it('should save to localStorage after debounce', () => {
    const { result } = renderHook(() =>
      useResizablePanels({
        storageKey: mockStorageKey,
        defaultSizes,
        debounceMs: 100,
      })
    );

    act(() => {
      result.current.setSize('leftSidebar', 300);
    });

    // Should not save immediately
    expect(localStorage.getItem(mockStorageKey)).toBeNull();

    // Fast-forward past debounce
    act(() => {
      vi.advanceTimersByTime(100);
    });

    const stored = JSON.parse(localStorage.getItem(mockStorageKey)!);
    expect(stored.leftSidebar).toBe(300);
  });

  it('should debounce multiple rapid updates', () => {
    const { result } = renderHook(() =>
      useResizablePanels({
        storageKey: mockStorageKey,
        defaultSizes,
        debounceMs: 100,
      })
    );

    act(() => {
      result.current.setSize('leftSidebar', 260);
      result.current.setSize('leftSidebar', 270);
      result.current.setSize('leftSidebar', 280);
    });

    // Fast-forward past debounce
    act(() => {
      vi.advanceTimersByTime(100);
    });

    const stored = JSON.parse(localStorage.getItem(mockStorageKey)!);
    // Should only save the last value
    expect(stored.leftSidebar).toBe(280);
  });

  it('should handle missing storageKey gracefully', () => {
    const { result } = renderHook(() =>
      useResizablePanels({
        defaultSizes,
      })
    );

    act(() => {
      result.current.setSize('leftSidebar', 300);
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // localStorage should remain empty
    expect(localStorage.getItem('anything')).toBeNull();
    expect(result.current.sizes.leftSidebar).toBe(300);
  });

  it('should handle invalid localStorage data', () => {
    localStorage.setItem(mockStorageKey, 'invalid json');

    const { result } = renderHook(() =>
      useResizablePanels({
        storageKey: mockStorageKey,
        defaultSizes,
      })
    );

    // Should fall back to defaults
    expect(result.current.sizes).toEqual(defaultSizes);
  });

  it('should handle partial localStorage data', () => {
    const partialData = {
      leftSidebar: 300,
      // Missing rightSidebar and main
    };
    localStorage.setItem(mockStorageKey, JSON.stringify(partialData));

    const { result } = renderHook(() =>
      useResizablePanels({
        storageKey: mockStorageKey,
        defaultSizes,
      })
    );

    // Should fall back to defaults when keys are missing
    expect(result.current.sizes).toEqual(defaultSizes);
  });

  it('should handle unknown panelId in updateSize', () => {
    const { result } = renderHook(() =>
      useResizablePanels({
        defaultSizes,
      })
    );

    act(() => {
      result.current.updateSize('unknownPanel', 50);
    });

    // Should add the new panel with default + delta
    expect(result.current.sizes.unknownPanel).toBeNaN();
  });

  it('should handle unknown panelId in setSize', () => {
    const { result } = renderHook(() =>
      useResizablePanels({
        defaultSizes,
      })
    );

    act(() => {
      result.current.setSize('unknownPanel', 500);
    });

    expect(result.current.sizes.unknownPanel).toBe(500);
  });
});
