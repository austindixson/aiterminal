/**
 * useCursorAnimation — smooth cursor animation hook.
 *
 * Uses requestAnimationFrame to lerp between current and target positions,
 * producing buttery-smooth cursor movement.
 */

import { useEffect, useRef, useState } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AnimatedPosition {
  readonly x: number
  readonly y: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Interpolation factor per frame (0-1). Higher = snappier. */
const LERP_FACTOR = 0.15

/** Stop animating when distance is below this threshold (px). */
const SNAP_THRESHOLD = 0.5

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCursorAnimation(
  targetX: number,
  targetY: number,
  isActive: boolean,
): AnimatedPosition {
  const [position, setPosition] = useState<AnimatedPosition>({ x: targetX, y: targetY })
  const currentRef = useRef<AnimatedPosition>({ x: targetX, y: targetY })
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!isActive) {
      // Snap to target immediately when inactive
      currentRef.current = { x: targetX, y: targetY }
      setPosition({ x: targetX, y: targetY })
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      return
    }

    const animate = (): void => {
      const current = currentRef.current
      const dx = targetX - current.x
      const dy = targetY - current.y
      const distance = Math.sqrt(dx * dx + dy * dy)

      if (distance < SNAP_THRESHOLD) {
        // Close enough — snap to target
        currentRef.current = { x: targetX, y: targetY }
        setPosition({ x: targetX, y: targetY })
        rafRef.current = null
        return
      }

      // Lerp toward target
      const nextX = current.x + dx * LERP_FACTOR
      const nextY = current.y + dy * LERP_FACTOR
      currentRef.current = { x: nextX, y: nextY }
      setPosition({ x: nextX, y: nextY })

      rafRef.current = requestAnimationFrame(animate)
    }

    rafRef.current = requestAnimationFrame(animate)

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [targetX, targetY, isActive])

  return position
}
