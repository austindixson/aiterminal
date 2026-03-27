# VRM Settings Integration Guide

This guide explains how to integrate the `VRMSettings` component into AITerminal's App.tsx for customizable avatar behavior.

## Files Created

1. **`src/renderer/components/VRMSettings.tsx`** - React component
2. **`src/renderer/styles/vrm-settings.css`** - Glass-morphism styling (auto-imported via components.css)

## Features

- **Glass-morphism design** matching AITerminal's aesthetic
- **Collapsible sections** for organized settings
- **Sliders** for fine-tuned numeric control
- **Toggle switches** for boolean settings
- **LocalStorage persistence** with debounced saves
- **Keyboard shortcut** (Cmd+Shift+V) for quick access
- **Responsive design** for small screens

## Settings Available

### Expression Settings
- **Expression Transition Speed** (0.1 - 2.0x) - How fast expressions change
- **Emotion Intensity** (0% - 100%) - Strength of facial expressions
- **Lip-sync Sensitivity** (0.1 - 2.0x) - Mouth animation during TTS playback

### Animation Settings
- **Blink Frequency** (0.5 - 5.0s) - Time between automatic blinks
- **Idle Animation Speed** (0.5 - 2.0x) - Breathing and sway animations
- **Gesture Animation Speed** (0.5 - 2.0x) - Wave, nod, and other gestures

### Advanced Settings
- **Cursor Tracking Sensitivity** (0.0 - 2.0x) - Head follows mouse cursor
- **Debug Mode** (toggle) - Show expression names in console

## Integration Steps

### Step 1: Add State to App.tsx

Add these state variables near the top of your App component:

```typescript
// VRM Settings panel
const [vrmSettingsVisible, setVrmSettingsVisible] = useState(false)
const [vrmSettings, setVrmSettings] = useState<VRMSettings | null>(null)
```

Import the type:
```typescript
import type { VRMSettings } from '@/renderer/components/VRMSettings'
```

### Step 2: Add Keyboard Shortcut

Add the Cmd+Shift+V handler in your keyboard event handler (around line 408):

```typescript
// Cmd+Shift+V — Toggle VRM settings
if (isMeta && e.shiftKey && e.key === 'v') {
  e.preventDefault()
  setVrmSettingsVisible(prev => !prev)
  return
}
```

### Step 3: Add Settings Change Handler

Create a handler to receive settings updates:

```typescript
const handleVRMSettingsChange = useCallback((settings: VRMSettings) => {
  setVrmSettings(settings)
  // Pass settings to InternAvatar component
  console.log('[App] VRM settings updated:', settings)
}, [])
```

### Step 4: Render VRMSettings Component

Add the VRMSettings component at the end of your JSX (before closing divs):

```tsx
{/* VRM Settings Panel */}
<VRMSettings
  isVisible={vrmSettingsVisible}
  onClose={() => setVrmSettingsVisible(false)}
  onSettingsChange={handleVRMSettingsChange}
/>
```

### Step 5: Pass Settings to InternAvatar

Update your InternAvatar component(s) to receive and use the settings:

```tsx
<InternAvatar
  intern={activeIntern}
  isRunning={agentLoop.state.isRunning}
  events={agentLoop.state.events}
  onInternSelect={handleInternSelect}
  isStreaming={chat.state.isStreaming}
  hasInput={chat.state.hasInput}
  activeSessionCwd={activeTabCwd}
  activeSessionId={terminalTabs.getActiveSessionId()}
  vrmSettings={vrmSettings} // ← Add this prop
/>
```

### Step 6: Update InternAvatar Component

Modify `InternAvatar.tsx` to accept and use VRM settings:

#### Add prop to interface:
```typescript
interface InternAvatarProps {
  // ... existing props
  vrmSettings?: VRMSettings | null
}
```

#### Apply settings in animation loop:

Example for cursor tracking sensitivity (around line 437):
```typescript
// Get cursor tracking sensitivity from settings (default 1.0)
const cursorSensitivity = vrmSettings?.cursorTrackingSensitivity ?? 1.0

// Apply to lerp factor
const lerpFactor = 0.1 * cursorSensitivity
head.rotation.y += (targetYaw - head.rotation.y) * lerpFactor
head.rotation.x += (targetPitch - head.rotation.x) * lerpFactor
```

Example for blink frequency (around line 500):
```typescript
// Get blink frequency from settings (default 3.0)
const blinkFrequency = vrmSettings?.blinkFrequency ?? 3.0

blinkTimer += delta
if (!isBlinking && blinkTimer > blinkFrequency + Math.random() * 2) {
  // ... blink logic
}
```

Example for expression intensity (around line 1082):
```typescript
// Get emotion intensity from settings (default 1.0)
const intensity = vrmSettings?.emotionIntensity ?? 1.0

if (preset) {
  expressionManager.setValue(preset, 0.9 * intensity)
  setCurrentExpression(expressionName as VRMExpression)
}
```

Example for lip-sync sensitivity (around line 359):
```typescript
// Get lip-sync sensitivity from settings (default 1.0)
const lipSyncSensitivity = vrmSettings?.lipSyncSensitivity ?? 1.0

// Primary: open mouth (aa) with full volume
expressionManager?.setValue(VRMExpressionPresetName.Aa, baseVol * 0.8 * lipSyncSensitivity)
```

Example for animation speeds (around line 391):
```typescript
// Get animation speeds from settings (default 1.0)
const idleAnimSpeed = vrmSettings?.idleAnimationSpeed ?? 1.0
const gestureAnimSpeed = vrmSettings?.gestureAnimationSpeed ?? 1.0

// Apply to breathing animation
const breathSpeed = 1.5 * idleAnimSpeed
const breath = Math.sin(elapsed * breathSpeed) * breathIntensity
```

Example for debug mode:
```typescript
// Log expression changes if debug mode is enabled
if (vrmSettings?.debugMode) {
  console.log(`[InternAvatar] Expression: ${expressionName}, Intensity: ${intensity}`)
}
```

## Complete Example

Here's a complete integration example for App.tsx:

```typescript
import { VRMSettings } from '@/renderer/components/VRMSettings'
import type { VRMSettings } from '@/renderer/components/VRMSettings'

export const App: FC = () => {
  // ... existing state

  // VRM Settings
  const [vrmSettingsVisible, setVrmSettingsVisible] = useState(false)
  const [vrmSettings, setVrmSettings] = useState<VRMSettings | null>(null)

  // Handle settings changes
  const handleVRMSettingsChange = useCallback((settings: VRMSettings) => {
    setVrmSettings(settings)
  }, [])

  // Keyboard handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey

      // ... existing shortcuts

      // Cmd+Shift+V — Toggle VRM settings
      if (isMeta && e.shiftKey && e.key === 'v') {
        e.preventDefault()
        setVrmSettingsVisible(prev => !prev)
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="app-layout">
      {/* ... existing JSX */}

      <InternAvatar
        intern={activeIntern}
        isRunning={agentLoop.state.isRunning}
        events={agentLoop.state.events}
        onInternSelect={handleInternSelect}
        vrmSettings={vrmSettings}
      />

      <VRMSettings
        isVisible={vrmSettingsVisible}
        onClose={() => setVrmSettingsVisible(false)}
        onSettingsChange={handleVRMSettingsChange}
      />
    </div>
  )
}
```

## Default Settings

The component uses these defaults (stored in localStorage key `'vrm-settings'`):

```typescript
{
  expressionTransitionSpeed: 1.0,
  emotionIntensity: 1.0,
  lipSyncSensitivity: 1.0,
  blinkFrequency: 3.0,
  idleAnimationSpeed: 1.0,
  gestureAnimationSpeed: 1.0,
  cursorTrackingSensitivity: 1.0,
  debugMode: false,
}
```

## Styling Customization

The CSS uses CSS custom properties for theming:

```css
--glass-bg: rgba(30, 32, 44, 0.95);
--glass-border: rgba(255, 255, 255, 0.1);
--terminal-fg: #f8f8f2;
--ansi-blue: #bd93f9;
```

These automatically adapt to AITerminal's theme system.

## Testing

1. Open the app
2. Press `Cmd+Shift+V` to open settings
3. Adjust sliders and see values update
4. Close and reopen - settings should persist
5. Toggle debug mode to see console logs
6. Test with different VRM models

## Future Enhancements

Possible additions:
- Per-intern settings profiles
- Export/import settings as JSON
- Preset configurations (subtle, normal, expressive)
- Animation preview panel
- Expression timeline editor
- Camera angle presets
- Lighting adjustments

## Troubleshooting

**Settings not saving?**
- Check browser console for localStorage errors
- Verify localStorage quota not exceeded

**Panel not visible?**
- Check z-index conflicts (VRMSettings uses 10000)
- Verify `isVisible` prop is true

**Styles not applying?**
- Confirm CSS import in components.css
- Check for CSS specificity conflicts

**Keyboard shortcut not working?**
- Verify event listener is attached
- Check for conflicts with other shortcuts
- Ensure preventDefault() is called
