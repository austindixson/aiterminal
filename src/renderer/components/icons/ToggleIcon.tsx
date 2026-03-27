/*
 * Path: /Users/ghost/Desktop/aiterminal/src/renderer/components/icons/ToggleIcon.tsx
 * Module: renderer/components/icons
 * Purpose: VS Code-style chevron toggle icons for collapsible UI elements
 * Dependencies: react
 * Related: /Users/ghost/Desktop/aiterminal/src/renderer/components/AgentSelector.tsx
 * Keywords: chevron, toggle-icon, vs-code-style, collapsible, svg-icon
 * Last Updated: 2026-03-25
 */

import type { FC, SVGProps } from 'react'

export interface ToggleIconProps extends Omit<SVGProps<SVGSVGElement>, 'viewBox'> {
  readonly direction: 'left' | 'right' | 'up' | 'down'
  readonly size?: number
}

export const ToggleIcon: FC<ToggleIconProps> = ({
  direction,
  size = 16,
  className = '',
  ...props
}) => {
  // Rotation angles for each direction
  const rotations = {
    left: 0,
    up: 90,
    right: 180,
    down: 270,
  }

  const rotation = rotations[direction]

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
      style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 0.2s ease' }}
      {...props}
    >
      {/* Chevron pointing left (base shape, rotated for other directions) */}
      <path d="M11 7.5L8.5 5L6 7.5M6 8.5L8.5 11L11 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  )
}
