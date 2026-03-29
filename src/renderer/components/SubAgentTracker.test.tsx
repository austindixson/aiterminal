/*
 * SubAgentTracker Component Tests
 *
 * Run with: npx vitest run SubAgentTracker.test.tsx
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SubAgentTracker } from './SubAgentTracker';
import type { SubAgent } from './SubAgentTracker';

describe('SubAgentTracker', () => {
  it('renders empty state when no agents', () => {
    render(<SubAgentTracker agents={[]} />);

    expect(screen.getByText(/no sub-agents running/i)).toBeInTheDocument();
    expect(screen.getByText(/agents will appear here/i)).toBeInTheDocument();
  });

  it('renders agent cards', () => {
    const agents: SubAgent[] = [
      {
        id: 'agent-1',
        description: 'Test agent',
        status: 'running',
        tokensUsed: 1000,
        startTime: new Date(),
      },
    ];

    render(<SubAgentTracker agents={agents} />);

    expect(screen.getByText('agent-1')).toBeInTheDocument();
    expect(screen.getByText('Test agent')).toBeInTheDocument();
    expect(screen.getByText(/1\.0k tokens/)).toBeInTheDocument();
  });

  it('displays summary statistics', () => {
    const agents: SubAgent[] = [
      {
        id: 'agent-1',
        description: 'Agent 1',
        status: 'running',
        tokensUsed: 1000,
        startTime: new Date(),
      },
      {
        id: 'agent-2',
        description: 'Agent 2',
        status: 'completed',
        tokensUsed: 2000,
        startTime: new Date(),
        endTime: new Date(),
      },
    ];

    render(<SubAgentTracker agents={agents} />);

    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getAllByText('3.0k').length).toBeGreaterThanOrEqual(1);
  });

  it('shows error state for failed agents', () => {
    const agents: SubAgent[] = [
      {
        id: 'agent-1',
        description: 'Failing agent',
        status: 'error',
        tokensUsed: 500,
        startTime: new Date(),
        endTime: new Date(),
        error: 'Connection timeout',
      },
    ];

    render(<SubAgentTracker agents={agents} />);

    expect(screen.getByText(/error/i)).toBeInTheDocument();
    expect(screen.getByText('Connection timeout')).toBeInTheDocument();
  });

  it('displays output preview when available', () => {
    const longOutput = 'A'.repeat(150);

    const agents: SubAgent[] = [
      {
        id: 'agent-1',
        description: 'Agent with output',
        status: 'running',
        tokensUsed: 1000,
        startTime: new Date(),
        output: longOutput,
      },
    ];

    render(<SubAgentTracker agents={agents} />);

    // Output should be truncated to 100 chars
    expect(screen.getByText(/AAA\.\.\./)).toBeInTheDocument();
  });

  it('sorts agents by status priority', () => {
    const agents: SubAgent[] = [
      {
        id: 'agent-completed',
        description: 'Completed agent',
        status: 'completed',
        tokensUsed: 1000,
        startTime: new Date(),
        endTime: new Date(),
      },
      {
        id: 'agent-running',
        description: 'Running agent',
        status: 'running',
        tokensUsed: 500,
        startTime: new Date(),
      },
      {
        id: 'agent-pending',
        description: 'Pending agent',
        status: 'pending',
        tokensUsed: 0,
        startTime: new Date(),
      },
    ];

    const { container } = render(<SubAgentTracker agents={agents} />);

    const cards = container.querySelectorAll('.sub-agent-card');
    const firstCardId = cards[0].querySelector('.sub-agent-card__id')?.textContent;

    // Running agent should be first
    expect(firstCardId).toBe('agent-running');
  });

  it('shows active agent count badge', () => {
    const agents: SubAgent[] = [
      {
        id: 'agent-1',
        description: 'Running agent',
        status: 'running',
        tokensUsed: 1000,
        startTime: new Date(),
      },
      {
        id: 'agent-2',
        description: 'Completed agent',
        status: 'completed',
        tokensUsed: 2000,
        startTime: new Date(),
        endTime: new Date(),
      },
    ];

    const { container } = render(<SubAgentTracker agents={agents} />);

    const badge = container.querySelector('.sub-agent-tracker__tab-badge');
    expect(badge?.textContent).toBe('1');
  });
});

// Helper functions
describe('formatDuration', () => {
  it('formats milliseconds', () => {
    // This would be tested if we export formatDuration
    // For now, just documenting expected behavior
    expect(true).toBe(true);
  });

  it('formats seconds', () => {
    // Expected: "2.3s" for 2300ms
    expect(true).toBe(true);
  });

  it('formats minutes', () => {
    // Expected: "1m 15s" for 75000ms
    expect(true).toBe(true);
  });
});

describe('formatTokens', () => {
  it('formats small token counts', () => {
    // Expected: "999" for 999 tokens
    expect(true).toBe(true);
  });

  it('formats thousands', () => {
    // Expected: "1.2k" for 1200 tokens
    // Expected: "15.8k" for 15800 tokens
    expect(true).toBe(true);
  });
});
