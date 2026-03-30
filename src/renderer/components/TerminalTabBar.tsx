/**
 * TerminalTabBar — tab bar for multiple terminal sessions
 *
 * Displays a scrollable list of terminal tabs with:
 * - Tab name (e.g., "zsh", "bash")
 * - Current path (CWD) - shortened to fit
 * - Agent activity indicator (when agent is running)
 * - Close button (X)
 * - Active tab highlighting
 * - Add button (+) for new tabs
 */

import type { FC } from 'react'
import type { Tab } from '@/types/terminal-tabs'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shortenPath(path: string, maxLength = 30): string {
  if (path.length <= maxLength) return path
  // Handle both Unix (/) and Windows (\) separators
  const parts = path.split(/[/\\]/).filter(Boolean)
  if (parts.length <= 2) return path
  const s = path.includes('\\') ? '\\' : '/'
  return `...${s}${parts.slice(-2).join(s)}`
}

function getInternColor(intern?: string): string {
  switch (intern) {
    case 'mei': return '#3b82f6' // blue
    case 'sora': return '#10b981' // green
    case 'hana': return '#f97316' // orange
    default: return '#6b7280' // gray
  }
}

function getInternLabel(intern?: string): string {
  switch (intern) {
    case 'mei': return 'MEI'
    case 'sora': return 'SORA'
    case 'hana': return 'HANA'
    default: return ''
  }
}

export interface TerminalTabBarProps {
  readonly tabs: ReadonlyArray<Tab>
  readonly activeTabId: string | null
  readonly onTabClick: (tabId: string) => void
  readonly onTabClose: (tabId: string) => void
  readonly onNewTab: () => void
}

export const TerminalTabBar: FC<TerminalTabBarProps> = ({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onNewTab,
}) => {
  const handleTabClose = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation() // Prevent tab switch when clicking close
    onTabClose(tabId)
  }

  return (
    <div className="terminal-tab-bar">
      {/* Tab list */}
      <div className="terminal-tab-bar__list">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`terminal-tab ${tab.id === activeTabId ? 'terminal-tab--active' : ''} ${tab.type === 'terminal' && tab.agentIntern ? `terminal-tab--agent-${tab.agentIntern}` : ''}`}
            onClick={() => onTabClick(tab.id)}
            title={tab.type === 'file' ? tab.filePath : `${tab.name} - ${tab.cwd}${tab.agentActivity ? `\nAgent: ${tab.agentActivity}` : ''}`}
          >
            <div className="terminal-tab__content">
              <span className="terminal-tab__name">
                {tab.type === 'file' ? '📄 ' : ''}{tab.name}
              </span>
              {tab.type === 'terminal' && (
                <span className="terminal-tab__path" title={tab.cwd}>
                  {shortenPath(tab.cwd)}
                </span>
              )}
              {tab.type === 'file' && (
                <span className="terminal-tab__path" title={tab.filePath} style={{ opacity: 0.5 }}>
                  {shortenPath(tab.filePath)}
                </span>
              )}
              {tab.type === 'terminal' && tab.agentIntern && (
                <span
                  className="terminal-tab__agent-badge"
                  style={{ backgroundColor: getInternColor(tab.agentIntern) }}
                  title={`Agent: ${tab.agentIntern} - ${tab.agentActivity || 'Working...'}`}
                >
                  {getInternLabel(tab.agentIntern)}
                </span>
              )}
            </div>
            <button
              type="button"
              className="terminal-tab__close"
              onClick={(e) => handleTabClose(e, tab.id)}
              aria-label={`Close ${tab.name} tab`}
              title="Close tab"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Add button */}
      <button
        type="button"
        className="terminal-tab-bar__add"
        onClick={onNewTab}
        aria-label="New terminal tab"
        title="New terminal tab (Cmd+N)"
      >
        +
      </button>
    </div>
  )
}
