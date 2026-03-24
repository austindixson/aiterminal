import { type ReactElement } from 'react';
import { render, type RenderOptions } from '@testing-library/react';

import type {
  Theme,
  CommandResult,
  AIResponse,
} from '@/types/index';

// Re-export the canonical types for convenience in tests
export type { Theme, CommandResult, AIResponse };

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

/**
 * Returns a valid Theme object with sensible defaults (dark theme).
 * Pass partial overrides to customise individual properties.
 */
export function createMockTheme(overrides: Partial<Theme> = {}): Theme {
  return {
    name: 'default-dark',
    colors: {
      bg: '#1e1e2e',
      fg: '#cdd6f4',
      cursor: '#f5e0dc',
      selection: '#585b7066',
      ansi: [
        '#45475a', '#f38ba8', '#a6e3a1', '#f9e2af',
        '#89b4fa', '#f5c2e7', '#94e2d5', '#bac2de',
        '#585b70', '#f38ba8', '#a6e3a1', '#f9e2af',
        '#89b4fa', '#f5c2e7', '#94e2d5', '#a6adc8',
      ] as const,
    },
    opacity: 1.0,
    blur: 0,
    ...overrides,
  };
}

/**
 * Returns a mock CommandResult representing a completed shell command.
 */
export function createMockCommandResult(
  overrides: Partial<CommandResult> = {},
): CommandResult {
  return {
    exitCode: 0,
    stdout: 'hello\n',
    stderr: '',
    isAITriggered: false,
    ...overrides,
  };
}

/**
 * Returns a mock AIResponse matching the AI service layer shape.
 */
export function createMockAIResponse(
  overrides: Partial<AIResponse> = {},
): AIResponse {
  return {
    content: 'This is a mock AI response.',
    model: 'gpt-4',
    tokens: 75,
    latency: 320,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

/**
 * Wraps a component with all required providers (theme context, etc.).
 *
 * Right now the provider tree is minimal because the app is early-stage.
 * As context providers are added, wrap them here so every test gets them
 * automatically.
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  // When a ThemeProvider or other context providers exist, wrap `ui` here.
  // For now we render directly so the helper is already wired into the
  // test suite and ready to extend.
  return render(ui, { ...options });
}

// ---------------------------------------------------------------------------
// Async helpers
// ---------------------------------------------------------------------------

/**
 * Waits for an xterm.js Terminal to be "ready" inside a container element.
 *
 * In practice this means the `.xterm-screen` element exists in the DOM,
 * which signals that the terminal has been opened and rendered.
 *
 * @param container - The DOM node that contains the terminal mount point.
 * @param timeoutMs - Maximum wait time in milliseconds (default 3 000).
 */
export async function waitForTerminalReady(
  container: HTMLElement,
  timeoutMs = 3_000,
): Promise<HTMLElement> {
  const start = Date.now();

  return new Promise<HTMLElement>((resolve, reject) => {
    const check = () => {
      const screen = container.querySelector('.xterm-screen');
      if (screen) {
        resolve(screen as HTMLElement);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(
          new Error(
            `waitForTerminalReady: .xterm-screen not found within ${timeoutMs}ms`,
          ),
        );
        return;
      }
      requestAnimationFrame(check);
    };
    check();
  });
}
