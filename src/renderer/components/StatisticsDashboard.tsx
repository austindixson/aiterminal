/*
 * Path: /Users/ghost/Desktop/aiterminal/src/renderer/components/StatisticsDashboard.tsx
 * Module: renderer/components
 * Purpose: Statistics dashboard displaying token usage, tool usage, MCP usage, and session metrics
 * Dependencies: react
 * Related: /Users/ghost/Desktop/aiterminal/src/renderer/components/ChatSidebar.tsx
 * Keywords: statistics, dashboard, metrics, token-usage, tool-usage, mcp-usage, charts
 * Last Updated: 2026-03-25
 */

import { useState } from 'react';

interface ToolUsage {
  tool: string;
  count: number;
  avgDuration: number;  // ms
}

interface MCPUsage {
  server: string;
  calls: number;
  errors: number;
}

interface ModelUsage {
  model: string;
  tokens: number;
  cost: number;  // USD
}

export interface StatisticsData {
  totalTokens: number;
  totalCost: number;
  sessionDuration: number;  // seconds
  modelUsage: ModelUsage[];
  toolUsage: ToolUsage[];
  mcpUsage: MCPUsage[];
}

interface StatisticsDashboardProps {
  data: StatisticsData;
  timeRange?: 'session' | 'today' | 'week';
  onTimeRangeChange?: (range: 'session' | 'today' | 'week') => void;
}

export function StatisticsDashboard({
  data,
  timeRange = 'session',
  onTimeRangeChange
}: StatisticsDashboardProps) {
  const [selectedRange, setSelectedRange] = useState<'session' | 'today' | 'week'>(timeRange);

  const handleRangeChange = (range: 'session' | 'today' | 'week') => {
    setSelectedRange(range);
    onTimeRangeChange?.(range);
  };

  // Format helpers
  const formatTokens = (tokens: number): string => {
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
    return tokens.toString();
  };

  const formatCost = (cost: number): string => {
    return cost >= 1 ? `$${cost.toFixed(2)}` : `${(cost * 100).toFixed(2)}¢`;
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  };

  const formatDurationMs = (ms: number): string => {
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
    return `${ms}ms`;
  };

  // Calculate max values for bar charts
  const maxTokens = Math.max(...data.modelUsage.map(m => m.tokens), 1);
  // const maxToolCount = Math.max(...data.toolUsage.map(t => t.count), 1); // TODO: Use for bar chart
  // const maxMCPCalls = Math.max(...data.mcpUsage.map(m => m.calls), 1); // TODO: Use for bar chart

  return (
    <div className="stats-dashboard">
      {/* Time Range Selector */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px'
      }}>
        <h3 style={{
          margin: 0,
          fontSize: '14px',
          fontWeight: 600,
          color: '#a9b1d6'
        }}>
          Statistics
        </h3>
        <div style={{
          display: 'flex',
          gap: '4px',
          background: 'rgba(255, 255, 255, 0.05)',
          padding: '3px',
          borderRadius: '6px'
        }}>
          {(['session', 'today', 'week'] as const).map((range) => (
            <button
              key={range}
              onClick={() => handleRangeChange(range)}
              style={{
                padding: '4px 10px',
                border: 'none',
                borderRadius: '4px',
                background: selectedRange === range
                  ? 'rgba(122, 162, 247, 0.2)'
                  : 'transparent',
                color: selectedRange === range
                  ? '#7aa2f7'
                  : 'rgba(255, 255, 255, 0.6)',
                fontSize: '11px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                textTransform: 'capitalize',
              }}
              onMouseEnter={(e) => {
                if (selectedRange !== range) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                }
              }}
              onMouseLeave={(e) => {
                if (selectedRange !== range) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="stats-summary">
        <div className="stat-card">
          <div className="stat-value">{formatTokens(data.totalTokens)}</div>
          <div className="stat-label">Total Tokens</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{formatCost(data.totalCost)}</div>
          <div className="stat-label">Estimated Cost</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{formatDuration(data.sessionDuration)}</div>
          <div className="stat-label">Session Duration</div>
        </div>
      </div>

      {/* Token Usage by Model */}
      {data.modelUsage.length > 0 && (
        <div className="stats-section">
          <div className="stats-section-title">Token Usage by Model</div>
          {data.modelUsage.map((usage) => {
            const percentage = (usage.tokens / maxTokens) * 100;
            return (
              <div key={usage.model} className="stat-bar-container">
                <div className="stat-bar-label">
                  <span style={{ fontWeight: 500 }}>{usage.model}</span>
                  <span style={{ color: '#7aa2f7' }}>
                    {formatTokens(usage.tokens)} ({formatCost(usage.cost)})
                  </span>
                </div>
                <div className="stat-bar">
                  <div
                    className="stat-bar-fill"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tool Usage */}
      {data.toolUsage.length > 0 && (
        <div className="stats-section">
          <div className="stats-section-title">Tool Usage</div>
          <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            borderRadius: '6px',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            overflow: 'hidden'
          }}>
            {data.toolUsage.map((usage) => (
              <div key={usage.tool} className="tool-usage-item">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    color: '#7dcfff',
                    background: 'rgba(125, 207, 255, 0.1)',
                    padding: '2px 6px',
                    borderRadius: '3px'
                  }}>
                    {usage.tool}
                  </span>
                  <span style={{ color: 'rgba(255, 255, 255, 0.5)' }}>
                    {formatDurationMs(usage.avgDuration)} avg
                  </span>
                </div>
                <span style={{
                  fontWeight: 600,
                  color: '#9ece6a'
                }}>
                  {usage.count}x
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MCP Usage */}
      {data.mcpUsage.length > 0 && (
        <div className="stats-section">
          <div className="stats-section-title">MCP Server Usage</div>
          <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            borderRadius: '6px',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            overflow: 'hidden'
          }}>
            {data.mcpUsage.map((usage) => {
              const errorRate = usage.calls > 0 ? (usage.errors / usage.calls) * 100 : 0;
              const hasErrors = usage.errors > 0;

              return (
                <div key={usage.server} className="mcp-usage-item">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      className="mcp-status"
                      style={{
                        background: hasErrors ? '#f7768e' : '#9ece6a',
                        boxShadow: hasErrors
                          ? '0 0 8px rgba(247, 118, 142, 0.4)'
                          : '0 0 8px rgba(158, 206, 106, 0.4)'
                      }}
                    />
                    <span style={{ fontWeight: 500 }}>{usage.server}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{
                      fontWeight: 600,
                      color: '#7aa2f7'
                    }}>
                      {usage.calls} calls
                    </span>
                    {hasErrors && (
                      <span style={{
                        fontSize: '11px',
                        color: '#f7768e',
                        background: 'rgba(247, 118, 142, 0.1)',
                        padding: '2px 6px',
                        borderRadius: '3px'
                      }}>
                        {usage.errors} errors ({errorRate.toFixed(1)}%)
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {data.modelUsage.length === 0 &&
       data.toolUsage.length === 0 &&
       data.mcpUsage.length === 0 && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 24px',
          textAlign: 'center',
          opacity: 0.5
        }}>
          <div style={{
            fontSize: '48px',
            marginBottom: '12px',
            opacity: 0.6
          }}>
            📊
          </div>
          <div style={{
            fontSize: '13px',
            color: 'rgba(255, 255, 255, 0.6)',
            margin: '0 0 8px 0',
            fontWeight: 500
          }}>
            No statistics yet
          </div>
          <div style={{
            fontSize: '11px',
            color: 'rgba(255, 255, 255, 0.4)',
            margin: 0
          }}>
            Statistics will appear here as you use the terminal
          </div>
        </div>
      )}
    </div>
  );
}
