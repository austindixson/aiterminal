# VRM Pose System - Quick Start Guide

## Installation

The pose system is already installed in `/src/renderer/vrm-poses.ts`. No additional dependencies required.

## Basic Usage

```typescript
import { getPoseController } from '../vrm-poses';

// 1. Initialize (once per VRM model)
const poseController = getPoseController(vrmModel);

// 2. Update every frame
function animate(delta: number) {
  poseController.update(delta);
}

// 3. Set poses
poseController.setPose('thinking');      // Hand on chin
poseController.setPose('celebrating');   // Arms up
poseController.setPose('typing');        // Keyboard position
poseController.reset();                  // Back to idle
```

## Available Poses

| Pose | Best For |
|------|----------|
| `idle` | Default state, waiting |
| `thinking` | Processing, analyzing, tool execution |
| `presenting` | Explaining, gesturing forward |
| `typing` | Writing code, text input |
| `celebrating` | Success, completion |
| `listening` | Receiving input, focused |
| `confused` | Errors, unexpected situations |
| `writing` | Taking notes, documentation |

## Integration Example

```typescript
// In InternAvatar.tsx
import { getPoseController } from '../vrm-poses';
import { createEmote } from '../vrm-emotes';

// Map events to poses
const EVENT_TO_POSE = {
  'tool:start': 'thinking',
  'assistant:delta': 'listening',
  'lifecycle:end': 'celebrating',
};

// Initialize
useEffect(() => {
  if (vrmModel) {
    const controller = getPoseController(vrmModel);
    controller.setPose('idle');
  }
}, [vrmModel]);

// Apply poses based on events
useEffect(() => {
  if (!events.length) return;
  const latestEvent = events[events.length - 1];
  const poseType = EVENT_TO_POSE[latestEvent.stream];

  if (poseType) {
    poseControllerRef.current?.setPose(poseType);
  }
}, [events]);

// Update in animation loop
const animate = () => {
  const delta = clock.getDelta();
  poseControllerRef.current?.update(delta);
  // ... other updates
  requestAnimationFrame(animate);
};
```

## Advanced Features

### Custom Transition Speed

```typescript
// Slow transition (1 second)
poseController.transitionTo('thinking', 1.0);

// Fast transition (0.2 seconds)
poseController.transitionTo('celebrating', 0.2);
```

### Blend Factor

```typescript
// Full pose (default)
poseController.setPose('celebrating', 1.0);

// Subtle hint (10%)
poseController.setPose('thinking', 0.1);

// Half blend (50%)
poseController.setPose('presenting', 0.5);
```

### Layer with Emotes

```typescript
// Set base pose
poseController.setPose('presenting');

// Add wave emote on top
const wave = createEmote('wave', 2000);
poseController.setLayeredEmote(wave);

// Clear emote (keep pose)
poseController.setLayeredEmote(null);
```

### Check State

```typescript
// Get current pose
const current = poseController.getCurrentPose();
console.log(`Current pose: ${current}`);  // 'thinking'

// Check if transitioning
if (poseController.isTransitioning()) {
  console.log('Pose transition in progress...');
}
```

## Common Patterns

### Auto-Reset to Idle

```typescript
useEffect(() => {
  if (!isRunning && !isStreaming) {
    const timer = setTimeout(() => {
      poseControllerRef.current?.reset();
    }, 3000);

    return () => clearTimeout(timer);
  }
}, [isRunning, isStreaming]);
```

### Pose + Expression Combo

```typescript
// Set body pose
poseController.setPose('thinking');

// Set facial expression
expressionController.playEmotion('neutral');

// Result: Thoughtful body + neutral face
```

### Sequential Poses

```typescript
async function demonstrateWorkflow() {
  poseController.setPose('idle');
  await delay(1000);

  poseController.setPose('thinking');
  await delay(2000);

  poseController.setPose('celebrating');
  await delay(1500);

  poseController.reset();
}
```

## Troubleshooting

### Pose Not Changing

**Problem:** `setPose()` called but no visible change

**Solutions:**
1. Ensure `update(delta)` is called every frame
2. Check VRM model has required humanoid bones
3. Verify pose type is valid (see list above)

### Jerky Transitions

**Problem:** Transitions not smooth

**Solutions:**
1. Check delta time is passed to `update()`
2. Ensure `requestAnimationFrame` loop is running
3. Try longer transition duration

### Conflicting with Emotes

**Problem:** Pose and emote fight for bone control

**Solutions:**
1. Use `setLayeredEmote()` instead of direct emote application
2. Apply pose first, then layer emote
3. Reset pose before applying new emote

## Performance Tips

1. **Singleton Access** - Always use `getPoseController()` instead of `new PoseController()`
2. **Minimal Updates** - Only call `update()` when VRM is visible
3. **Bone Caching** - Controller caches bone lookups automatically
4. **Transition Duration** - Shorter transitions = less interpolation work

## Type Safety

Full TypeScript support:

```typescript
import type { PoseType, Pose, PoseController } from '../vrm-poses';

const pose: PoseType = 'thinking';  // ✅ Type-safe
const bad: PoseType = 'dancing';    // ❌ Compile error

const controller: PoseController = getPoseController(vrm);  // ✅ Typed
```

## See Also

- **Full Implementation:** `VRM_POSES_IMPLEMENTATION.md`
- **Emotes System:** `/src/renderer/vrm-emotes.ts`
- **Expression Controller:** `/src/renderer/vrm-expression-controller.ts`
- **InternAvatar Component:** `/src/renderer/components/InternAvatar.tsx`

## Support

For issues or questions:
1. Check implementation doc for details
2. Review example code in InternAvatar.tsx
3. Test with different VRM models (mei, sora, hana)
