import React from 'react';

interface State {
  hasError: boolean;
  error?: string;
}

/**
 * Error boundary for chat message rendering.
 * Catches crashes from malformed markdown, tool parsing, etc.
 * and shows a fallback instead of killing the entire chat sidebar.
 */
export class ChatErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: error.message };
  }

  componentDidCatch(error: Error) {
    console.error('[ChatErrorBoundary] Render error caught:', error.message);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div style={{
          padding: '8px 12px',
          background: 'rgba(255,50,50,0.1)',
          border: '1px solid rgba(255,50,50,0.2)',
          borderRadius: '6px',
          color: '#ff6b6b',
          fontSize: '12px',
          margin: '4px 0',
        }}>
          Message render error: {this.state.error || 'Unknown'}
        </div>
      );
    }
    return this.props.children;
  }
}
