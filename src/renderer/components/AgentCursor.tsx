/**
 * AgentCursor — animated cursor component for AI agents.
 *
 * Renders an SVG mouse-pointer arrow in the agent's color, plus a name
 * label pill and optional typing-dots indicator.
 */

import type { FC } from 'react'
import type { AgentIdentity, CursorPosition } from '@/types/agent-cursor'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AgentCursorProps {
  readonly position: CursorPosition
  readonly agent: AgentIdentity
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const AgentCursor: FC<AgentCursorProps> = ({ position, agent }) => {
  const activeClass = position.isActive
    ? 'agent-cursor--active'
    : 'agent-cursor--inactive'

  return (
    <div
      className={`agent-cursor ${activeClass}`}
      style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
      data-agent-id={agent.id}
    >
      {/* SVG pointer arrow */}
      <div className="agent-cursor__pointer">
        <svg
          width="16"
          height="20"
          viewBox="0 0 16 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M1 1L1 15L5.5 11L10 19L12.5 17.5L8 10L14 10L1 1Z"
            fill={agent.color}
            stroke="rgba(0,0,0,0.4)"
            strokeWidth="1"
          />
        </svg>
      </div>

      {/* Name label pill */}
      <div
        className="agent-cursor__label"
        style={{ backgroundColor: agent.color }}
      >
        <span className="agent-cursor__icon">{agent.icon}</span>
        <span>{agent.name}</span>
      </div>

      {/* Typing dots — only when active */}
      {position.isActive && (
        <div className="agent-cursor__typing">
          <span className="agent-cursor__dot" />
          <span className="agent-cursor__dot" />
          <span className="agent-cursor__dot" />
        </div>
      )}
    </div>
  )
}
