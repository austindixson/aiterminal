# SubAgentTracker Component

## Overview

The `SubAgentTracker` component provides real-time visual monitoring of parallel agent execution progress. It displays active sub-agents with status indicators, token usage, duration tracking, and visual progress bars.

## Files

- **Component**: `/Users/ghost/Desktop/aiterminal/src/renderer/components/SubAgentTracker.tsx`
- **Styles**: `/Users/ghost/Desktop/aiterminal/src/renderer/styles/components.css` (lines 1759-2200+)
- **Examples**: `/Users/ghost/Desktop/aiterminal/src/renderer/components/SubAgentTracker.example.tsx`

## Features

### Visual Design
- **Tab Switcher**: Toggle between "Terminal Activity" and "Sub-Agents" views
- **Status Cards**: Individual cards for each agent with color-coded borders
  - Running: Blue glow with pulsing animation
  - Completed: Green border with success indicator
  - Error: Red border with error message display
  - Pending: Dimmed opacity showing queued agents

### Agent Information Display
- **Agent ID**: Unique identifier (monospace font)
- **Description**: Human-readable task description
- **Status Badge**: Visual status indicator with icon
- **Duration**: Real-time elapsed time (e.g., "2.3s", "1m 15s")
- **Token Usage**: Token count with smart formatting (e.g., "1.2k", "15.8k")
- **Progress Bar**: Animated progress indicator for running agents
- **Output Preview**: Truncated output snippet (first 100 chars)
- **Error Messages**: Full error display for failed agents

### Summary Statistics
- Active agents count
- Total agents count
- Aggregate token usage across all agents

## TypeScript Types

```typescript
export type SubAgentStatus = 'pending' | 'running' | 'completed' | 'error';

export interface SubAgent {
  id: string;
  description: string;
  status: SubAgentStatus;
  tokensUsed: number;
  startTime: Date;
  endTime?: Date;
  output?: string;
  error?: string;
}

export interface SubAgentTrackerProps {
  agents: SubAgent[];
}
```

## Usage Example

```typescript
import { SubAgentTracker, SubAgent } from './components/SubAgentTracker';

function MyComponent() {
  const [agents, setAgents] = useState<SubAgent[]>([
    {
      id: 'agent-1',
      description: 'Analyze codebase architecture',
      status: 'running',
      tokensUsed: 1250,
      startTime: new Date(),
    },
  ]);

  return <SubAgentTracker agents={agents} />;
}
```

## Integration Pattern

The component is designed to integrate with the agent loop system:

1. **Agent Start**: Create new `SubAgent` entry with `status: 'running'`
2. **Progress Updates**: Update `tokensUsed` and `output` fields
3. **Completion**: Set `status: 'completed'` and `endTime`
4. **Errors**: Set `status: 'error'` and provide `error` message

## Styling Architecture

The component follows the project's glass-morphism design system:

- **Glass Background**: `rgba(255, 255, 255, 0.02)` with backdrop blur
- **Border Colors**: Status-based (blue/green/red/transparent)
- **Animations**: Pulse effects for running agents, smooth transitions
- **Typography**: SF Mono for IDs/metrics, system font for descriptions
- **Responsive**: Scrollable content with custom scrollbar styling

## CSS Classes

### Container
- `.sub-agent-tracker` - Main container
- `.sub-agent-tracker__tabs` - Tab switcher
- `.sub-agent-tracker__tab` - Individual tab button
- `.sub-agent-tracker__content` - Scrollable content area

### Summary
- `.sub-agent-tracker__summary` - Stats container
- `.sub-agent-tracker__stat` - Individual stat
- `.sub-agent-tracker__stat-label` - Stat label
- `.sub-agent-tracker__stat-value` - Stat value

### Agent Cards
- `.sub-agent-card` - Base card style
- `.sub-agent-card--running` - Active agent style
- `.sub-agent-card--completed` - Success style
- `.sub-agent-card--error` - Error style
- `.sub-agent-card--pending` - Queued agent style

### Card Elements
- `.sub-agent-card__header` - Top row (ID + status)
- `.sub-agent-card__id` - Agent identifier
- `.sub-agent-card__status` - Status badge
- `.sub-agent-card__description` - Task description
- `.sub-agent-card__meta` - Duration + tokens row
- `.sub-agent-card__progress` - Progress bar container
- `.sub-agent-card__progress-bar` - Animated progress fill
- `.sub-agent-card__output` - Output preview
- `.sub-agent-card__error` - Error message

## Future Enhancements

Potential improvements for future iterations:

1. **Expandable Details**: Click card to show full output
2. **Agent Cancellation**: Add cancel button for running agents
3. **Performance Metrics**: CPU/memory usage per agent
4. **Dependency Graph**: Visual representation of agent dependencies
5. **Batch Operations**: Select multiple agents for bulk actions
6. **Filter/Sort**: Filter by status, sort by duration/tokens
7. **Export**: Download agent logs as JSON/text

## Dependencies

- React 18+
- TypeScript 5+
- No external runtime dependencies (pure React component)

## Performance Considerations

- **Re-render Optimization**: Agents sorted by status priority (running first)
- **Memory Management**: Limit output preview to 100 characters
- **Animation Performance**: CSS animations (GPU-accelerated)
- **Scroll Performance**: Virtual scrolling recommended for 50+ agents

## Testing

See `SubAgentTracker.example.tsx` for:
- Simulated agent execution
- Status transitions (pending → running → completed/error)
- Token usage updates
- Error handling scenarios
