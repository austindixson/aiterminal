/*
 * Path: /Users/ghost/Desktop/aiterminal/src/renderer/components/StatisticsDashboard.example.tsx
 * Module: renderer/components
 * Purpose: Example usage of StatisticsDashboard component
 * Related: /Users/ghost/Desktop/aiterminal/src/renderer/components/StatisticsDashboard.tsx
 * Last Updated: 2026-03-25
 */

import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { StatisticsDashboard } from './StatisticsDashboard';
import type { StatisticsData } from './StatisticsDashboard';

// Example data for demonstration
const exampleData: StatisticsData = {
  totalTokens: 156789,
  totalCost: 2.45,
  sessionDuration: 1847, // ~30 minutes
  modelUsage: [
    {
      model: 'claude-sonnet-4.6',
      tokens: 98543,
      cost: 1.85
    },
    {
      model: 'claude-haiku-4.5',
      tokens: 45231,
      cost: 0.42
    },
    {
      model: 'gpt-4o',
      tokens: 13015,
      cost: 0.18
    }
  ],
  toolUsage: [
    {
      tool: 'Bash',
      count: 47,
      avgDuration: 1234
    },
    {
      tool: 'Read',
      count: 23,
      avgDuration: 156
    },
    {
      tool: 'Edit',
      count: 12,
      avgDuration: 892
    },
    {
      tool: 'WebSearch',
      count: 5,
      avgDuration: 3456
    },
    {
      tool: 'Grep',
      count: 8,
      avgDuration: 445
    }
  ],
  mcpUsage: [
    {
      server: 'context7',
      calls: 34,
      errors: 0
    },
    {
      server: 'lossless-recall',
      calls: 18,
      errors: 1
    },
    {
      server: 'web-reader',
      calls: 12,
      errors: 0
    },
    {
      server: 'zai-mcp',
      calls: 8,
      errors: 2
    }
  ]
};

// Example 2: Empty state (no data yet)
const emptyData: StatisticsData = {
  totalTokens: 0,
  totalCost: 0,
  sessionDuration: 0,
  modelUsage: [],
  toolUsage: [],
  mcpUsage: []
};

export function StatisticsDashboardExample() {
  const [timeRange, setTimeRange] = useState<'session' | 'today' | 'week'>('session');
  const [showEmpty, setShowEmpty] = useState(false);

  return (
    <div style={{
      width: '400px',
      height: '600px',
      background: '#1a1b26',
      borderRadius: '12px',
      overflow: 'hidden'
    }}>
      <div style={{
        padding: '16px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h2 style={{
          margin: 0,
          fontSize: '16px',
          fontWeight: 600,
          color: '#a9b1d6'
        }}>
          Statistics Dashboard Demo
        </h2>
        <button
          onClick={() => setShowEmpty(!showEmpty)}
          style={{
            padding: '6px 12px',
            background: 'rgba(122, 162, 247, 0.2)',
            border: '1px solid rgba(122, 162, 247, 0.4)',
            borderRadius: '6px',
            color: '#7aa2f7',
            fontSize: '12px',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          {showEmpty ? 'Show Data' : 'Show Empty'}
        </button>
      </div>

      <StatisticsDashboard
        data={showEmpty ? emptyData : exampleData}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
      />
    </div>
  );
}

// For development/testing
if (typeof window !== 'undefined') {
  const container = document.getElementById('statistics-dashboard-example');
  if (container) {
    const root = createRoot(container);
    root.render(<StatisticsDashboardExample />);
  }
}
