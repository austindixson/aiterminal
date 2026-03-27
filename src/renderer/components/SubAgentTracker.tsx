/*
 * Path: /Users/ghost/Desktop/aiterminal/src/renderer/components/SubAgentTracker.tsx
 * Module: renderer/components
 * Purpose: Visual tracker for parallel agent execution - displays real-time progress of sub-agents
 * Dependencies: react
 * Related: /Users/ghost/Desktop/aiterminal/src/renderer/components/InternAvatar.tsx
 * Keywords: sub-agents, parallel-execution, progress-tracker, agent-monitoring
 * Last Updated: 2026-03-25
 */

import { useState } from 'react';

/**
 * Sub-agent status tracking for parallel execution
 */
export type SubAgentStatus = 'pending' | 'running' | 'completed' | 'error';

/**
 * Individual sub-agent metadata
 */
export interface SubAgent {
  id: string;
  description: string;
  status: SubAgentStatus;
  tokensUsed: number;
  startTime: Date;
  endTime?: Date;
  output?: string;
  error?: string;
}

/**
 * Props for SubAgentTracker component
 */
export interface SubAgentTrackerProps {
  agents: SubAgent[];
}

/**
 * Helper to format duration (e.g., "2.3s", "1m 15s")
 */
function formatDuration(startTime: Date, endTime?: Date): string {
  const end = endTime || new Date();
  const ms = end.getTime() - startTime.getTime();

  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`;
  }

  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
}

/**
 * Helper to format token count (e.g., "1.2k", "15.8k")
 */
function formatTokens(tokens: number): string {
  if (tokens < 1000) {
    return tokens.toString();
  }
  return `${(tokens / 1000).toFixed(1)}k`;
}

/**
 * Tab switching state for sidebar bottom section
 */
type TrackerTab = 'terminal' | 'agents';

/**
 * SubAgentTracker - Visual progress monitor for parallel agent execution
 *
 * Displays active sub-agents with real-time status updates, token usage,
 * and visual progress indicators. Color-coded by status (running/completed/error).
 */
export function SubAgentTracker({ agents }: SubAgentTrackerProps) {
  const [activeTab, setActiveTab] = useState<TrackerTab>('terminal');

  // Sort agents: running first, then pending, then completed/error
  const sortedAgents = [...agents].sort((a, b) => {
    const statusPriority = { running: 0, pending: 1, completed: 2, error: 3 };
    return statusPriority[a.status] - statusPriority[b.status];
  });

  const activeAgents = sortedAgents.filter(a => a.status !== 'completed' && a.status !== 'error');
  const totalTokens = agents.reduce((sum, a) => sum + a.tokensUsed, 0);

  if (agents.length === 0) {
    return (
      <div className="sub-agent-tracker">
        <div className="sub-agent-tracker__tabs">
          <button
            className="sub-agent-tracker__tab sub-agent-tracker__tab--active"
            onClick={() => setActiveTab('terminal')}
          >
            Terminal Activity
          </button>
          <button
            className="sub-agent-tracker__tab"
            onClick={() => setActiveTab('agents')}
          >
            Sub-Agents
          </button>
        </div>
        <div className="sub-agent-tracker__empty">
          <p className="sub-agent-tracker__empty-text">No sub-agents running</p>
          <p className="sub-agent-tracker__empty-hint">Agents will appear here during parallel execution</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sub-agent-tracker">
      {/* Tab Switcher */}
      <div className="sub-agent-tracker__tabs">
        <button
          className={`sub-agent-tracker__tab ${activeTab === 'terminal' ? 'sub-agent-tracker__tab--active' : ''}`}
          onClick={() => setActiveTab('terminal')}
        >
          Terminal Activity
        </button>
        <button
          className={`sub-agent-tracker__tab ${activeTab === 'agents' ? 'sub-agent-tracker__tab--active' : ''}`}
          onClick={() => setActiveTab('agents')}
        >
          Sub-Agents
          {activeAgents.length > 0 && (
            <span className="sub-agent-tracker__tab-badge">{activeAgents.length}</span>
          )}
        </button>
      </div>

      {/* Agent List */}
      <div className="sub-agent-tracker__content">
        {/* Summary Stats */}
        {agents.length > 0 && (
          <div className="sub-agent-tracker__summary">
            <div className="sub-agent-tracker__stat">
              <span className="sub-agent-tracker__stat-label">Active</span>
              <span className="sub-agent-tracker__stat-value">{activeAgents.length}</span>
            </div>
            <div className="sub-agent-tracker__stat">
              <span className="sub-agent-tracker__stat-label">Total</span>
              <span className="sub-agent-tracker__stat-value">{agents.length}</span>
            </div>
            <div className="sub-agent-tracker__stat">
              <span className="sub-agent-tracker__stat-label">Tokens</span>
              <span className="sub-agent-tracker__stat-value">{formatTokens(totalTokens)}</span>
            </div>
          </div>
        )}

        {/* Agent Cards */}
        <div className="sub-agent-tracker__agents">
          {sortedAgents.map(agent => (
            <div
              key={agent.id}
              className={`sub-agent-card sub-agent-card--${agent.status}`}
            >
              {/* Header: ID + Status */}
              <div className="sub-agent-card__header">
                <span className="sub-agent-card__id">{agent.id}</span>
                <span className={`sub-agent-card__status sub-agent-card__status--${agent.status}`}>
                  {agent.status === 'running' && '● Running'}
                  {agent.status === 'pending' && '○ Pending'}
                  {agent.status === 'completed' && '✓ Done'}
                  {agent.status === 'error' && '✕ Error'}
                </span>
              </div>

              {/* Description */}
              <p className="sub-agent-card__description">{agent.description}</p>

              {/* Metadata */}
              <div className="sub-agent-card__meta">
                <span className="sub-agent-card__time">
                  {formatDuration(agent.startTime, agent.endTime)}
                </span>
                <span className="sub-agent-card__tokens">
                  {formatTokens(agent.tokensUsed)} tokens
                </span>
              </div>

              {/* Progress Bar (only for running agents) */}
              {agent.status === 'running' && (
                <div className="sub-agent-card__progress">
                  <div
                    className="sub-agent-card__progress-bar"
                    style={{
                      width: '100%',
                      animation: 'pulse 2s ease-in-out infinite'
                    }}
                  />
                </div>
              )}

              {/* Output Preview (if available) */}
              {agent.output && (
                <div className="sub-agent-card__output">
                  <span className="sub-agent-card__output-preview">
                    {agent.output.slice(0, 100)}
                    {agent.output.length > 100 && '...'}
                  </span>
                </div>
              )}

              {/* Error Message (if error) */}
              {agent.error && (
                <div className="sub-agent-card__error">
                  <span className="sub-agent-card__error-message">{agent.error}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
