/**
 * Tests for StreamingText — displays AI response content as it streams in.
 *
 * TDD: these tests are written BEFORE the implementation.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StreamingText } from './StreamingText'
import type { AgentIdentity, StreamState } from '@/types/agent-cursor'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const debugAgent: AgentIdentity = {
  id: 'debug',
  name: 'Debug',
  color: '#FF5555',
  icon: '\u{1F534}',
}

function makeStreamState(overrides: Partial<StreamState> = {}): StreamState {
  return {
    agentId: 'debug',
    content: '',
    isStreaming: true,
    startTime: Date.now(),
    chunkCount: 0,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StreamingText', () => {
  it('renders empty when no content', () => {
    const { container } = render(
      <StreamingText
        streamState={makeStreamState({ content: '' })}
        agent={debugAgent}
      />,
    )

    const content = container.querySelector('.streaming-text__content')
    expect(content).toBeTruthy()
    // The content area should exist but have no text (besides possible cursor)
  })

  it('shows content as it accumulates', () => {
    render(
      <StreamingText
        streamState={makeStreamState({ content: 'Hello World' })}
        agent={debugAgent}
      />,
    )

    expect(screen.getByText(/Hello World/)).toBeTruthy()
  })

  it('shows blinking cursor at end while streaming', () => {
    const { container } = render(
      <StreamingText
        streamState={makeStreamState({ content: 'typing...', isStreaming: true })}
        agent={debugAgent}
      />,
    )

    const cursor = container.querySelector('.streaming-text__cursor')
    expect(cursor).toBeTruthy()
  })

  it('cursor disappears when streaming is done', () => {
    const { container } = render(
      <StreamingText
        streamState={makeStreamState({ content: 'done', isStreaming: false })}
        agent={debugAgent}
      />,
    )

    const cursor = container.querySelector('.streaming-text__cursor')
    expect(cursor).toBeNull()
  })

  it('detects code blocks (```) and wraps in pre/code', () => {
    const content = 'Before\n```\nconst x = 1;\n```\nAfter'
    const { container } = render(
      <StreamingText
        streamState={makeStreamState({ content, isStreaming: false })}
        agent={debugAgent}
      />,
    )

    const codeBlock = container.querySelector('.streaming-text__code-block')
    expect(codeBlock).toBeTruthy()
    expect(codeBlock!.textContent).toContain('const x = 1;')
  })

  it('preserves line breaks', () => {
    const content = 'Line 1\nLine 2\nLine 3'
    render(
      <StreamingText
        streamState={makeStreamState({ content, isStreaming: false })}
        agent={debugAgent}
      />,
    )

    expect(screen.getByText(/Line 1/)).toBeTruthy()
    expect(screen.getByText(/Line 2/)).toBeTruthy()
    expect(screen.getByText(/Line 3/)).toBeTruthy()
  })

  it('shows agent name and color in header', () => {
    const { container } = render(
      <StreamingText
        streamState={makeStreamState({ content: 'hi' })}
        agent={debugAgent}
      />,
    )

    const header = container.querySelector('.streaming-text__agent-header')
    expect(header).toBeTruthy()
    expect(header!.textContent).toContain('Debug')
  })

  it('shows model name in header when provided', () => {
    render(
      <StreamingText
        streamState={makeStreamState({ content: 'hi' })}
        agent={debugAgent}
        modelName="Claude Sonnet 4"
      />,
    )

    expect(screen.getByText(/Claude Sonnet 4/)).toBeTruthy()
  })

  it('shows colored dot in header matching agent color', () => {
    const { container } = render(
      <StreamingText
        streamState={makeStreamState({ content: 'hi' })}
        agent={debugAgent}
      />,
    )

    const dot = container.querySelector('.streaming-text__agent-dot') as HTMLElement
    expect(dot).toBeTruthy()
    expect(dot.style.backgroundColor).toBeTruthy()
  })
})
