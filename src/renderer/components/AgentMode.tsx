/*
 * Path: /Users/ghost/Desktop/aiterminal/src/renderer/components/AgentMode.tsx
 * Module: renderer/components
 * Purpose: Agent Mode toggle for titlebar with compact glass design
 * Dependencies: react
 * Related: /Users/ghost/Desktop/aiterminal/src/renderer/hooks/useAgentLoop.ts
 * Keywords: agent-mode, toggle, titlebar-control, glass-design
 * Last Updated: 2026-03-24
 */

import { useState, useCallback } from 'react';

interface AgentModeProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  activeIntern?: string | null;
  isRunning?: boolean;
  status?: 'idle' | 'running' | 'completed' | 'error';
}

export function AgentMode({
  enabled,
  onToggle,
  activeIntern,
  isRunning = false,
  status = 'idle'
}: AgentModeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [showAvatar, setShowAvatar] = useState(false);

  const handleToggle = useCallback(() => {
    onToggle(!enabled);
    if (!enabled) {
      // Auto-show avatar when enabling
      setShowAvatar(true);
    }
  }, [enabled, onToggle]);

  const internColors = {
    mei: '#3b82f6',
    sora: '#10b981',
    hana: '#f97316'
  };

  const internNames = {
    mei: 'MEI',
    sora: 'SORA',
    hana: 'HANA'
  };

  const statusText = {
    idle: 'Ready',
    running: activeIntern ? `${internNames[activeIntern as keyof typeof internNames]} Working` : 'Running',
    completed: 'Done ✓',
    error: 'Failed ✕'
  };

  return (
    <div className="titlebar-agent-mode">
      {/* Status indicator */}
      <div className="titlebar-agent-mode__status">
        {isRunning && (
          <span
            className="titlebar-agent-mode__dot titlebar-agent-mode__dot--active"
            style={{ backgroundColor: activeIntern ? internColors[activeIntern as keyof typeof internColors] : '#3b82f6' }}
          />
        )}
        <span className="titlebar-agent-mode__status-text">
          {statusText[status]}
        </span>
      </div>

      {/* Toggle button */}
      <button
        onClick={handleToggle}
        className={`titlebar-agent-mode__toggle ${enabled ? 'titlebar-agent-mode__toggle--enabled' : ''}`}
        aria-label="Toggle Agent Mode"
      >
        <span className="titlebar-agent-mode__toggle-slider" />
        <span className="titlebar-agent-mode__toggle-label">
          {enabled ? 'ON' : 'OFF'}
        </span>
      </button>

      {/* Avatar toggle */}
      {enabled && (
        <button
          onClick={() => setShowAvatar(!showAvatar)}
          className={`titlebar-agent-mode__avatar-btn ${showAvatar ? 'titlebar-agent-mode__avatar-btn--active' : ''}`}
          aria-label={showAvatar ? 'Hide Avatar' : 'Show Avatar'}
          title={showAvatar ? '🎭 Hide Avatar' : '🎭 Show Avatar'}
        >
          🎭
        </button>
      )}

      {/* Info button with tooltip */}
      <div className="titlebar-agent-mode__info">
        <button
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          className="titlebar-agent-mode__info-btn"
          aria-label="Agent Mode Info"
        >
          ?
        </button>

        {showTooltip && (
          <div className="titlebar-agent-mode__tooltip">
            <h4 className="titlebar-agent-mode__tooltip-title">Agent Mode</h4>
            <p className="titlebar-agent-mode__tooltip-desc">
              Route tasks to specialized AI interns
            </p>
            <div className="titlebar-agent-mode__tooltip-interns">
              <div className="titlebar-agent-mode__tooltip-intern">
                <span className="titlebar-agent-mode__tooltip-dot" style={{ backgroundColor: internColors.mei }} />
                <span>MEI — Dev & Coding</span>
              </div>
              <div className="titlebar-agent-mode__tooltip-intern">
                <span className="titlebar-agent-mode__tooltip-dot" style={{ backgroundColor: internColors.sora }} />
                <span>SORA — Research & Analysis</span>
              </div>
              <div className="titlebar-agent-mode__tooltip-intern">
                <span className="titlebar-agent-mode__tooltip-dot" style={{ backgroundColor: internColors.hana }} />
                <span>HANA — Content & Marketing</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Avatar panel (shown when enabled) */}
      {enabled && showAvatar && (
        <div className="titlebar-agent-mode__avatar-panel">
          <div className="titlebar-agent-mode__avatar-header">
            <span className="titlebar-agent-mode__avatar-title">
              {activeIntern ? internNames[activeIntern as keyof typeof internNames] : 'Agent'}
            </span>
            <span
              className="titlebar-agent-mode__avatar-status"
              style={{ color: activeIntern ? internColors[activeIntern as keyof typeof internColors] : '#6b7280' }}
            >
              {statusText[status]}
            </span>
          </div>
          <div className="titlebar-agent-mode__avatar-preview">
            {/* Avatar placeholder - will be replaced with VRM component */}
            <div className="titlebar-agent-mode__avatar-placeholder">
              <span className="titlebar-agent-mode__avatar-icon">
                {activeIntern === 'mei' ? '💻' : activeIntern === 'sora' ? '🔬' : activeIntern === 'hana' ? '✍️' : '🤖'}
              </span>
              <span className="titlebar-agent-mode__avatar-text">
                {activeIntern ? `${internNames[activeIntern as keyof typeof internNames]} is working...` : 'Agent ready'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
