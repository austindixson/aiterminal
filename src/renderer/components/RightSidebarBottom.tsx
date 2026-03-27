/*
 * Path: /Users/ghost/Desktop/aiterminal/src/renderer/components/RightSidebarBottom.tsx
 * Module: renderer/components
 * Purpose: Bottom section of right sidebar with tabbed interface (Terminal, Sub-Agents, Statistics)
 * Dependencies: react
 * Related: /Users/ghost/Desktop/aiterminal/src/renderer/App.tsx
 * Keywords: right-sidebar, tabs, terminal-activity, sub-agents, statistics
 * Last Updated: 2026-03-25
 */

import { useState } from 'react'
import type { FC } from 'react'
import { TerminalActivityView } from './TerminalActivityView'
import type { TerminalSession } from './TerminalActivityView'

export type TabId = 'terminal' | 'agents' | 'stats'

export interface Tab {
  id: TabId
  label: string
  icon: string
  count?: number
}

export interface RightSidebarBottomProps {
  readonly terminalSessions: TerminalSession[]
  readonly activeAgentsCount?: number
  readonly statisticsData?: StatisticsData
}

export interface StatisticsData {
  totalCommands?: number
  successfulCommands?: number
  failedCommands?: number
  aiQueries?: number
  uptime?: string
}

export const RightSidebarBottom: FC<RightSidebarBottomProps> = ({
  terminalSessions,
  activeAgentsCount = 0,
  statisticsData = {}
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('terminal')

  const tabs: Tab[] = [
    { id: 'terminal', label: 'Terminal', icon: '⌨️' },
    { id: 'agents', label: 'Sub-Agents', icon: '🤖', count: activeAgentsCount },
    { id: 'stats', label: 'Statistics', icon: '📊' },
  ]

  return (
    <div className="right-sidebar__bottom">
      {/* Tab Bar */}
      <div className="right-sidebar__tab-bar">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab-button ${activeTab === tab.id ? 'tab-button--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            title={tab.label}
          >
            <span className="tab-button__icon">{tab.icon}</span>
            <span className="tab-button__label">{tab.label}</span>
            {tab.count !== undefined && tab.count > 0 && (
              <span className="tab-badge">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="right-sidebar__tab-content">
        {activeTab === 'terminal' && (
          <TerminalActivityView sessions={terminalSessions} />
        )}

        {activeTab === 'agents' && (
          <div className="sub-agents-view">
            <div className="sub-agents-view__empty-state">
              <div className="sub-agents-view__icon">🤖</div>
              <div className="sub-agents-view__title">Sub-Agent Tracking</div>
              <div className="sub-agents-view__description">
                Active sub-agents will appear here during multi-agent operations
              </div>
              {activeAgentsCount > 0 && (
                <div className="sub-agents-view__count">
                  {activeAgentsCount} active {activeAgentsCount === 1 ? 'agent' : 'agents'}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'stats' && (
          <StatisticsDashboard data={statisticsData} />
        )}
      </div>
    </div>
  )
}

// Statistics Dashboard Component
interface StatisticsDashboardProps {
  readonly data: StatisticsData
}

const StatisticsDashboard: FC<StatisticsDashboardProps> = ({ data }) => {
  const stats = [
    { label: 'Total Commands', value: data.totalCommands ?? 0, icon: '⚡' },
    { label: 'Successful', value: data.successfulCommands ?? 0, icon: '✅' },
    { label: 'Failed', value: data.failedCommands ?? 0, icon: '❌' },
    { label: 'AI Queries', value: data.aiQueries ?? 0, icon: '🧠' },
  ]

  return (
    <div className="statistics-dashboard">
      <div className="statistics-dashboard__header">
        <span className="statistics-dashboard__title">Session Statistics</span>
        {data.uptime && (
          <span className="statistics-dashboard__uptime">Uptime: {data.uptime}</span>
        )}
      </div>

      <div className="statistics-dashboard__grid">
        {stats.map((stat) => (
          <div key={stat.label} className="stat-card">
            <div className="stat-card__icon">{stat.icon}</div>
            <div className="stat-card__content">
              <div className="stat-card__value">{stat.value}</div>
              <div className="stat-card__label">{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Success Rate */}
      {data.totalCommands && data.totalCommands > 0 && (
        <div className="statistics-dashboard__success-rate">
          <div className="success-rate__label">Success Rate</div>
          <div className="success-rate__bar">
            <div
              className="success-rate__fill"
              style={{
                width: `${((data.successfulCommands ?? 0) / data.totalCommands) * 100}%`
              }}
            />
          </div>
          <div className="success-rate__value">
            {Math.round(((data.successfulCommands ?? 0) / data.totalCommands) * 100)}%
          </div>
        </div>
      )}
    </div>
  )
}
