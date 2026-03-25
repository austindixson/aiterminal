# AI Intern VRM Avatar System

**Status:** ✅ Implemented and ready to use!

## Overview

Each AI intern (Mei, Sora, Hana) now has a 3D anime-style avatar that emotes in real-time based on what they're doing. The avatars use **VRM** (Virtual Reality Model) format - the open standard for anime 3D characters.

## Features

### 🎭 Real-time Expressions
Avatars automatically change expressions based on agent events:

| Event Type | Expression | Description |
|-----------|-----------|-------------|
| `lifecycle:start` | Neutral | Intern starts working |
| `lifecycle:end` | Happy | Task completed successfully |
| `lifecycle:error` | Sad | Error occurred |
| `tool:start` | Ohh (thinking) | Concentrating on work |
| `tool:end` | Happy | Tool execution finished |
| `assistant:delta` | Aah (talking) | Generating output |
| `handoff` | Surprised | Handing off to another intern |
| `error` | Angry | Something went wrong |

### 🌬️ Idle Animations
When not actively working, avatars:
- **Breathe** naturally (subtle chest animation)
- **Blink** periodically
- Cycle through idle expressions every 3 seconds

### 👥 Intern-Specific Models
Each intern has their own VRM model URL (customizable):
- **Mei (Dev)**: Blue theme - coding & development
- **Sora (Research)**: Green theme - research & analysis
- **Hana (Content)**: Orange theme - content & marketing

## Usage

### In Your App

```tsx
import { AgentMode } from '@/renderer/components/AgentMode';
import { useAgentLoop } from '@/renderer/hooks/useAgentLoop';

function MyComponent() {
  const agentLoop = useAgentLoop({ enabled: true });

  return (
    <AgentMode
      enabled={agentLoop.enabled}
      onToggle={agentLoop.setEnabled}
      activeIntern={agentLoop.activeIntern}
      isRunning={agentLoop.isRunning}
      status={agentLoop.isRunning ? 'running' : 'idle'}
      events={agentLoop.events}
    />
  );
}
```

### Toggle Avatar Visibility

The AgentMode component includes a "🎭 Show/Hide Avatar" button when agent mode is enabled.

## Customization

### Using Your Own VRM Models

1. **Create a VRM model:**
   - Download [VRoid Studio](https://vroid.com/studio/) (free)
   - Design your character
   - Export as `.vrm` file

2. **Host the file:**
   - Put it in your project's `public/` folder
   - Or host it on a CDN

3. **Update the model URL:**

```tsx
// In src/renderer/components/InternAvatar.tsx
const INTERN_VRM_MODELS: Record<string, string> = {
  mei: 'https://your-cdn.com/mei.vrm',  // ← Your custom URL
  sora: 'https://your-cdn.com/sora.vrm',
  hana: 'https://your-cdn.com/hana.vrm'
};
```

### Adding Custom Expressions

The `EVENT_TO_EXPRESSION` mapping controls which expressions show for which events:

```tsx
const EVENT_TO_EXPRESSION: Record<string, VRMExpression> = {
  'lifecycle:start': 'neutral',
  'lifecycle:end': 'happy',
  'custom:event': 'joy',  // ← Add your own
};
```

Available expressions (VRM presets):
- `neutral`, `happy`, `angry`, `sad`, `surprised`
- `joy`, `sorrow`, `fun`
- `aa`, `ih`, `ou`, `ee`, `oh` (mouth shapes for talking)
- `blink`

## Performance

- **Lazy Loading:** Three.js and VRM libraries only load when avatar is first displayed
- **Dynamic Import:** Reduces initial bundle size by ~2MB
- **Optimization:** VRM models are optimized with `VRMUtils.removeUnnecessaryVertices()` and `combineSkeletons()`

## Dependencies Installed

```bash
npm install three @pixiv/three-vrm
npm install --save-dev @types/three
```

## Technical Details

### Stack
- **Three.js**: 3D rendering engine
- **@pixiv/three-vrm**: VRM loader and expression manager
- **React**: Component integration
- **TypeScript**: Type-safe event handling

### Avatar Component Lifecycle

1. **Mount**: Detect which intern is active
2. **Load VRM**: Fetch and parse 3D model
3. **Setup Scene**: Camera, lights, controls
4. **Event Listener**: Watch for agent events
5. **Update Expressions**: Map events to facial expressions
6. **Animate**: Breathing, blinking, idle states
7. **Unmount**: Cleanup Three.js resources

### Event Flow

```
Agent Event (e.g., "tool:start")
    ↓
InternAvatar useEffect()
    ↓
Map to expression ("ou" = thinking face)
    ↓
Apply to VRM expressionManager
    ↓
Reset to neutral after 3 seconds
```

## Future Enhancements (Not Yet Implemented)

- 🗣️ **Lip Sync**: Sync mouth movements to actual text output
- 👀 **Eye Tracking**: Follow mouse cursor with gaze
- 🎤 **Voice Integration**: Use Kokoro TTS for voice + lip sync
- 🎨 **Custom Poses**: Idle animations (typing on keyboard, reading book, etc.)
- 🌐 **Multi-Language**: Expressions that match different languages
- 💬 **Speech Bubbles**: Show text output near avatar

## Troubleshooting

### Avatar not loading
- Check browser console for errors
- Verify VRM URL is accessible
- Ensure CORS headers are set if hosting externally

### Expressions not changing
- Check that agent events are firing
- Verify `events` prop is being passed to AgentMode
- Look at the "Expression" indicator at bottom of avatar

### Performance issues
- Avatar rendering is GPU-intensive
- Use "Hide Avatar" button if experiencing lag
- Consider using lower-poly VRM models

## Credits

- **VRoid Studio**: Character creation tool by pixiv
- **three-vrm**: VRM loader for Three.js
- **Sample Models**: Public domain VRM models from pixiv/three-vrm repo

---

**Ready to see your interns come to life! 🎭✨**
