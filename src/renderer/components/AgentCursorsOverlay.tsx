/**
 * AgentCursorsOverlay — container that renders all active agent cursors.
 *
 * Positioned absolute over its parent with pointer-events: none so it
 * never intercepts clicks.
 */

import type { FC } from 'react'
import { AgentCursor } from './AgentCursor'
import type { AgentIdentity, CursorPosition } from '@/types/agent-cursor'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AgentCursorsOverlayProps {
  readonly cursors: Readonly<Record<string, CursorPosition>>
  readonly agents: ReadonlyMap<string, AgentIdentity>
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const AgentCursorsOverlay: FC<AgentCursorsOverlayProps> = ({
  cursors,
  agents,
}) => {
  const entries = Object.entries(cursors)

  if (entries.length === 0) {
    return null
  }

  return (
    <div className="agent-cursors-overlay">
      {entries.map(([agentId, position]) => {
        const agent = agents.get(agentId)
        if (!agent) return null

        return (
          <AgentCursor
            key={agentId}
            position={position}
            agent={agent}
          />
        )
      })}
    </div>
  )
}
