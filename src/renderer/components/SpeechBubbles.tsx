/*
 * Path: /Users/ghost/Desktop/aiterminal/src/renderer/components/SpeechBubbles.tsx
 * Module: renderer/components
 * Purpose: Floating speech bubbles for VRM avatar - fade out halfway up the sidebar
 * Dependencies: react
 * Related: /Users/ghost/Desktop/aiterminal/src/renderer/components/InternAvatar.tsx
 * Keywords: speech-bubbles, vrm, avatar, floating-ui, fade-animation
 * Last Updated: 2026-03-26
 */

import { useEffect, useState } from 'react';
import type { FC } from 'react';

interface SpeechBubble {
  id: string;
  message: string;
  timestamp: number;
}

interface SpeechBubblesProps {
  messages: SpeechBubble[];
  onRemove?: (id: string) => void;
}

/**
 * Speech bubbles that float up from the VRM avatar and fade out
 * Bubbles start near the bottom and rise up, fading as they reach halfway
 */
export const SpeechBubbles: FC<SpeechBubblesProps> = ({ messages, onRemove }) => {
  const [visibleBubbles, setVisibleBubbles] = useState<SpeechBubble[]>([]);

  // Update visible bubbles when messages change
  useEffect(() => {
    setVisibleBubbles(messages);
  }, [messages]);

  // Remove old bubbles (after 5 seconds)
  useEffect(() => {
    const now = Date.now();
    const expired = visibleBubbles.filter(b => now - b.timestamp > 5000);

    if (expired.length > 0) {
      expired.forEach(b => onRemove?.(b.id));
    }
  }, [visibleBubbles, onRemove]);

  if (visibleBubbles.length === 0) return null;

  return (
    <div className="speech-bubbles">
      {visibleBubbles.map((bubble, index) => {
        const age = Date.now() - bubble.timestamp;
        const opacity = Math.max(0, 1 - age / 3000); // Fade over 3 seconds
        const yOffset = Math.min(50, age / 100); // Rise up over time

        return (
          <div
            key={bubble.id}
            className="speech-bubble"
            style={{
              opacity,
              transform: `translateY(${-yOffset}px)`,
              animationDelay: `${index * 100}ms`
            }}
          >
            <div className="speech-bubble__content">
              {bubble.message}
            </div>
            <div className="speech-bubble__tail" />
          </div>
        );
      })}
    </div>
  );
};

/**
 * Hook to manage speech bubble state
 */
export function useSpeechBubbles() {
  const [bubbles, setBubbles] = useState<SpeechBubble[]>([]);

  const addBubble = (message: string) => {
    const newBubble: SpeechBubble = {
      id: `bubble-${Date.now()}-${Math.random()}`,
      message,
      timestamp: Date.now(),
    };

    setBubbles(prev => [...prev, newBubble]);
  };

  const removeBubble = (id: string) => {
    setBubbles(prev => prev.filter(b => b.id !== id));
  };

  const clearBubbles = () => {
    setBubbles([]);
  };

  return {
    bubbles,
    addBubble,
    removeBubble,
    clearBubbles,
  };
}
