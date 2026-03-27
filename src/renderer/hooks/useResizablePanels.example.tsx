/**
 * Example usage of useResizablePanels hook
 *
 * This file demonstrates how to use the useResizablePanels hook
 * to create resizable panel layouts in your application.
 */

import { useResizablePanels } from './useResizablePanels';
import { useState, useRef } from 'react';

// Example 1: Simple sidebar layout
export function SidebarLayoutExample() {
  const { sizes, updateSize, resetAll } = useResizablePanels({
    storageKey: 'sidebar-layout-sizes',
    defaultSizes: {
      sidebar: 250,
      main: 800,
    },
    minSizes: {
      sidebar: 200,
      main: 400,
    },
    maxSizes: {
      sidebar: 500,
      main: 1200,
    },
  });

  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    startXRef.current = e.clientX;
    startWidthRef.current = sizes.sidebar;
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;

    const delta = e.clientX - startXRef.current;
    updateSize('sidebar', delta);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Add global mouse event listeners
  if (isDragging) {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div
        style={{ width: sizes.sidebar }}
        className="bg-gray-100 p-4"
      >
        <h2>Sidebar</h2>
        <p>Width: {Math.round(sizes.sidebar)}px</p>
        <button onClick={resetAll}>Reset Layout</button>
      </div>

      {/* Resize Handle */}
      <div
        onMouseDown={handleMouseDown}
        className="w-1 bg-gray-300 cursor-col-resize hover:bg-blue-500"
        style={{ cursor: isDragging ? 'col-resize' : 'col-resize' }}
      />

      {/* Main Content */}
      <div
        style={{ width: sizes.main }}
        className="bg-white p-4"
      >
        <h2>Main Content</h2>
        <p>Width: {Math.round(sizes.main)}px</p>
      </div>
    </div>
  );
}

// Example 2: Three-panel layout (left, center, right)
export function ThreePanelExample() {
  const { sizes, updateSize, setSize, resetSize } = useResizablePanels({
    storageKey: 'three-panel-sizes',
    defaultSizes: {
      left: 250,
      center: 600,
      right: 350,
    },
    minSizes: {
      left: 200,
      center: 400,
      right: 250,
    },
  });

  return (
    <div className="flex h-screen gap-1">
      <Panel
        id="left"
        label="Left Panel"
        width={sizes.left}
        onResize={(delta) => updateSize('left', delta)}
        onReset={() => resetSize('left')}
      />
      <Panel
        id="center"
        label="Center Panel"
        width={sizes.center}
        onResize={(delta) => updateSize('center', delta)}
        onReset={() => resetSize('center')}
      />
      <Panel
        id="right"
        label="Right Panel"
        width={sizes.right}
        onResize={(delta) => updateSize('right', delta)}
        onReset={() => resetSize('right')}
      />
    </div>
  );
}

// Helper component for resizable panels
interface PanelProps {
  id: string;
  label: string;
  width: number;
  onResize: (delta: number) => void;
  onReset: () => void;
}

function Panel({ id, label, width, onResize, onReset }: PanelProps) {
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    startXRef.current = e.clientX;
    startWidthRef.current = width;
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;

    const delta = e.clientX - startXRef.current;
    onResize(delta);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  if (isDragging) {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }

  return (
    <div className="flex">
      <div
        style={{ width }}
        className="bg-gray-50 border border-gray-200 p-4"
      >
        <h3>{label}</h3>
        <p>Width: {Math.round(width)}px</p>
        <button onClick={onReset}>Reset</button>
      </div>
      <div
        onMouseDown={handleMouseDown}
        className="w-1 bg-gray-300 cursor-col-resize hover:bg-blue-500"
      />
    </div>
  );
}

// Example 3: Absolute sizing (set specific size)
export function AbsoluteSizingExample() {
  const { sizes, setSize } = useResizablePanels({
    storageKey: 'absolute-sizing-sizes',
    defaultSizes: {
      panel1: 300,
      panel2: 400,
    },
  });

  return (
    <div className="flex h-screen gap-2">
      <div style={{ width: sizes.panel1 }} className="bg-blue-100 p-4">
        <h3>Panel 1</h3>
        <input
          type="number"
          value={Math.round(sizes.panel1)}
          onChange={(e) => setSize('panel1', Number(e.target.value))}
          className="border p-1"
        />
      </div>
      <div style={{ width: sizes.panel2 }} className="bg-green-100 p-4">
        <h3>Panel 2</h3>
        <input
          type="number"
          value={Math.round(sizes.panel2)}
          onChange={(e) => setSize('panel2', Number(e.target.value))}
          className="border p-1"
        />
      </div>
    </div>
  );
}
