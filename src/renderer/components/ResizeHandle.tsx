import React, { useState, useRef, useCallback, useEffect } from 'react';

interface ResizeHandleProps {
  direction: 'horizontal' | 'vertical';
  onDrag: (delta: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  minSize?: number;
  maxSize?: number;
  className?: string;
}

export const ResizeHandle: React.FC<ResizeHandleProps> = ({
  direction,
  onDrag,
  onDragStart,
  onDragEnd,
  minSize = 50,
  maxSize = 10000,
  className = '',
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    startPosRef.current = { x: e.clientX, y: e.clientY };
    setIsDragging(true);
    onDragStart?.();

    // Add global event listeners
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.userSelect = 'none';
  }, [onDragStart]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !startPosRef.current) return;

    const deltaX = e.clientX - startPosRef.current.x;
    const deltaY = e.clientY - startPosRef.current.y;

    // Calculate delta based on direction
    const delta = direction === 'horizontal' ? deltaX : deltaY;

    // Clamp delta based on min/max constraints
    const clampedDelta = Math.max(
      Math.min(delta, maxSize - minSize),
      -(maxSize - minSize)
    );

    onDrag(clampedDelta);
  }, [isDragging, direction, onDrag, minSize, maxSize]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    startPosRef.current = null;
    onDragEnd?.();

    // Remove global event listeners
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.userSelect = '';
  }, [onDragEnd, handleMouseMove]);

  // Touch support for mobile
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    const touch = e.touches[0];
    startPosRef.current = { x: touch.clientX, y: touch.clientY };
    setIsDragging(true);
    onDragStart?.();

    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
    document.body.style.userSelect = 'none';
  }, [onDragStart]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isDragging || !startPosRef.current) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - startPosRef.current.x;
    const deltaY = touch.clientY - startPosRef.current.y;

    const delta = direction === 'horizontal' ? deltaX : deltaY;
    const clampedDelta = Math.max(
      Math.min(delta, maxSize - minSize),
      -(maxSize - minSize)
    );

    onDrag(clampedDelta);
  }, [isDragging, direction, onDrag, minSize, maxSize]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    startPosRef.current = null;
    onDragEnd?.();

    document.removeEventListener('touchmove', handleTouchMove);
    document.removeEventListener('touchend', handleTouchEnd);
    document.body.style.userSelect = '';
  }, [onDragEnd, handleTouchMove]);

  // Cleanup event listeners on unmount
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.body.style.userSelect = '';
    };
  }, [handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

  const isHorizontal = direction === 'horizontal';

  return (
    <div
      className={`resize-handle ${isHorizontal ? 'resize-handle-horizontal' : 'resize-handle-vertical'} ${isDragging ? 'resize-handle-active' : ''} ${className}`}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      style={{
        position: 'relative',
        zIndex: 100,
        cursor: isHorizontal ? 'col-resize' : 'row-resize',
        // Larger hit area for easier grabbing (increased from 12px to 16px)
        width: isHorizontal ? '16px' : '100%',
        height: isHorizontal ? '100%' : '16px',
        // Don't grow or shrink in flex layout
        flex: '0 0 auto',
        // Visual indicator (thin line)
        backgroundColor: isDragging ? 'rgba(189, 147, 249, 0.5)' : 'transparent',
        // Center the visual indicator
        background: isDragging
          ? 'rgba(189, 147, 249, 0.5)'
          : isHorizontal
            ? 'linear-gradient(to right, transparent 6px, rgba(255, 255, 255, 0.15) 6px, rgba(255, 255, 255, 0.15) 10px, transparent 10px)'
            : 'linear-gradient(to bottom, transparent 6px, rgba(255, 255, 255, 0.15) 6px, rgba(255, 255, 255, 0.15) 10px, transparent 10px)',
        transition: isDragging ? 'none' : 'background-color 0.15s ease',
        pointerEvents: 'auto',
      }}
    />
  );
};

export default ResizeHandle;
