/**
 * Tests for AgentCursor — the animated cursor component.
 *
 * TDD: these tests are written BEFORE the implementation.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AgentCursor } from './AgentCursor'
import type { AgentIdentity, CursorPosition } from '@/types/agent-cursor'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const debugAgent: AgentIdentity = {
  id: 'debug',
  name: 'Debug',
  color: '#FF5555',
  icon: '\u{1F534}',
}

const explainAgent: AgentIdentity = {
  id: 'explain',
  name: 'Explain',
  color: '#8BE9FD',
  icon: '\u{1F4A1}',
}

function makeCursor(overrides: Partial<CursorPosition> = {}): CursorPosition {
  return {
    agentId: 'debug',
    x: 100,
    y: 200,
    label: 'Debug',
    isActive: true,
    lastUpdate: Date.now(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentCursor', () => {
  it('renders cursor at given x,y position using CSS transform', () => {
    const { container } = render(
      <AgentCursor position={makeCursor({ x: 150, y: 250 })} agent={debugAgent} />,
    )

    const cursor = container.querySelector('.agent-cursor') as HTMLElement
    expect(cursor).toBeTruthy()
    expect(cursor.style.transform).toContain('translate(150px, 250px)')
  })

  it('shows agent name label next to cursor', () => {
    render(
      <AgentCursor position={makeCursor()} agent={debugAgent} />,
    )

    expect(screen.getByText('Debug')).toBeTruthy()
  })

  it('uses agent color for the label background', () => {
    const { container } = render(
      <AgentCursor position={makeCursor()} agent={debugAgent} />,
    )

    const label = container.querySelector('.agent-cursor__label') as HTMLElement
    expect(label).toBeTruthy()
    expect(label.style.backgroundColor).toBeTruthy()
  })

  it('shows agent icon', () => {
    render(
      <AgentCursor position={makeCursor()} agent={debugAgent} />,
    )

    // The icon is the red circle emoji
    expect(screen.getByText('\u{1F534}')).toBeTruthy()
  })

  it('is hidden when isActive is false', () => {
    const { container } = render(
      <AgentCursor
        position={makeCursor({ isActive: false })}
        agent={debugAgent}
      />,
    )

    const cursor = container.querySelector('.agent-cursor') as HTMLElement
    expect(cursor.classList.contains('agent-cursor--inactive')).toBe(true)
  })

  it('has active class when isActive is true', () => {
    const { container } = render(
      <AgentCursor
        position={makeCursor({ isActive: true })}
        agent={debugAgent}
      />,
    )

    const cursor = container.querySelector('.agent-cursor') as HTMLElement
    expect(cursor.classList.contains('agent-cursor--active')).toBe(true)
  })

  it('shows typing indicator when agent is streaming (isActive)', () => {
    const { container } = render(
      <AgentCursor
        position={makeCursor({ isActive: true })}
        agent={debugAgent}
      />,
    )

    const typing = container.querySelector('.agent-cursor__typing')
    expect(typing).toBeTruthy()
  })

  it('hides typing indicator when agent is NOT streaming', () => {
    const { container } = render(
      <AgentCursor
        position={makeCursor({ isActive: false })}
        agent={debugAgent}
      />,
    )

    const typing = container.querySelector('.agent-cursor__typing')
    expect(typing).toBeNull()
  })

  it('renders multiple cursors independently', () => {
    const { container } = render(
      <>
        <AgentCursor position={makeCursor({ x: 10, y: 20 })} agent={debugAgent} />
        <AgentCursor
          position={makeCursor({ agentId: 'explain', x: 300, y: 400, label: 'Explain' })}
          agent={explainAgent}
        />
      </>,
    )

    const cursors = container.querySelectorAll('.agent-cursor')
    expect(cursors).toHaveLength(2)
  })

  it('label has a colored background pill', () => {
    const { container } = render(
      <AgentCursor position={makeCursor()} agent={debugAgent} />,
    )

    const label = container.querySelector('.agent-cursor__label') as HTMLElement
    expect(label).toBeTruthy()
    // Should have the agent's color as background
    expect(label.style.backgroundColor).toBeTruthy()
  })

  it('renders an SVG pointer element', () => {
    const { container } = render(
      <AgentCursor position={makeCursor()} agent={debugAgent} />,
    )

    const pointer = container.querySelector('.agent-cursor__pointer svg')
    expect(pointer).toBeTruthy()
  })
})
