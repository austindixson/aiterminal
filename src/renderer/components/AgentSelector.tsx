/*
 * Path: /Users/ghost/Desktop/aiterminal/src/renderer/components/AgentSelector.tsx
 * Module: renderer/components
 * Purpose: Minimal inline agent/intern selector with VS Code-style dropdown
 * Dependencies: react, ../vrm-models, ./icons/ToggleIcon
 * Related: /Users/ghost/Desktop/aiterminal/src/renderer/components/InternAvatar.tsx
 * Keywords: agent-selector, dropdown, intern-selection, vs-code-style, toggle
 * Last Updated: 2026-03-25
 */

import { useState, useRef, useEffect } from 'react'
import { getModelForIntern, getAllModels } from '../vrm-models'
import { ToggleIcon } from './icons/ToggleIcon'

export interface AgentSelectorProps {
  readonly selectedIntern: string | null
  readonly onSelectIntern: (intern: string) => void
  readonly disabled?: boolean
}

export function AgentSelector({ selectedIntern, onSelectIntern, disabled = false }: AgentSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const models = getAllModels()
  const currentModel = getModelForIntern(selectedIntern)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  const handleSelect = (internId: string) => {
    onSelectIntern(internId)
    setIsOpen(false)
  }

  return (
    <div className="agent-selector" ref={dropdownRef}>
      {/* Toggle Button */}
      <button
        type="button"
        className="agent-selector__toggle"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        aria-label="Select agent"
        aria-expanded={isOpen}
        title={`Current: ${currentModel.displayName}`}
      >
        <span className="agent-selector__current">
          <span className="agent-selector__emoji">{currentModel.emoji}</span>
          <span className="agent-selector__name">{currentModel.displayName}</span>
        </span>
        <ToggleIcon
          direction={isOpen ? 'up' : 'down'}
          size={12}
          className="agent-selector__chevron"
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="agent-selector__dropdown">
          <div className="agent-selector__list">
            {models.map((model) => {
              const isSelected = model.id === (selectedIntern || 'sora')
              return (
                <button
                  key={model.id}
                  type="button"
                  className={`agent-selector__option ${isSelected ? 'agent-selector__option--selected' : ''}`}
                  onClick={() => handleSelect(model.id)}
                  style={{
                    borderLeftColor: model.color,
                    backgroundColor: isSelected ? `${model.color}15` : 'transparent'
                  }}
                >
                  <span className="agent-selector__option-emoji">{model.emoji}</span>
                  <span className="agent-selector__option-name">{model.displayName}</span>
                  {isSelected && (
                    <span className="agent-selector__option-check" style={{ color: model.color }}>
                      ✓
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
