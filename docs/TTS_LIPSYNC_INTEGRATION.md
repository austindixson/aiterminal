# TTS + LipSync Integration Guide

## Overview

The Kokoro TTS system is now integrated with the VRM LipSync system, enabling real-time mouth animation during speech playback.

## Architecture

### Components

1. **LipSync** (`src/renderer/vrm-lip-sync.ts`)
   - Analyzes audio data in real-time using Web Audio API
   - Produces volume values (0-1) for driving mouth animations
   - Supports playback from ArrayBuffer or URL

2. **TTSLipSyncBridge** (`src/renderer/vrm-tts-bridge.ts`)
   - Singleton service that manages TTS + LipSync lifecycle
   - Handles AudioContext initialization
   - Coordinates audio playback with lip-sync analysis
   - Exposes `update()` method for animation loop

3. **InternAvatar** (`src/renderer/components/InternAvatar.tsx`)
   - Initializes TTSLipSyncBridge with AudioContext
   - Calls `ttsLipSyncBridge.update()` in animation loop
   - Applies lip-sync volume to VRM mouth expressions (aa/ih/ou/ee)

4. **useVoiceIO** (`src/renderer/hooks/useVoiceIO.ts`)
   - Decodes base64 TTS audio to ArrayBuffer
   - Passes audio to `ttsLipSyncBridge.playWithLipSync()`
   - Falls back to regular Audio() if bridge not initialized

## Data Flow

```
User speaks text
  ↓
useVoiceIO.speak(text)
  ↓
kokoroTtsSpeak IPC → main process
  ↓
Kokoro Python sidecar generates audio
  ↓
Returns base64 encoded audio
  ↓
Decode base64 → ArrayBuffer
  ↓
ttsLipSyncBridge.playWithLipSync(audioBuffer)
  ↓
LipSync.playFromArrayBuffer() → Web Audio API
  ↓
Audio plays through speakers
  ↓
AnalyserNode processes audio in real-time
  ↓
InternAvatar animation loop calls ttsLipSyncBridge.update()
  ↓
Returns volume value (0-1)
  ↓
Applied to VRM expressions:
  - Aa (main mouth open): volume × 0.8
  - Ih (narrow): volume × 0.3 × sin(time)
  - Ou (rounded): volume × 0.2 × cos(time)
  - Ee (wide): volume × 0.2 × sin(time)
  ↓
Mouth animates synchronously with speech!
```

## Usage

### Basic Usage

The integration is automatic. When TTS speaks:

```typescript
// In any component
const { speak } = useVoiceIO();

// This will automatically trigger lip-sync on the VRM avatar
await speak("Hello, I am your AI assistant!");
```

### Manual Control

If you need direct control:

```typescript
import { ttsLipSyncBridge } from './vrm-tts-bridge';

// Initialize (if not already done)
const audioContext = new AudioContext();
ttsLipSyncBridge.initialize(audioContext);

// Play audio with lip-sync
const audioBuffer = await fetchAudioData();
await ttsLipSyncBridge.playWithLipSync(audioBuffer);

// In animation loop
function animate() {
  const volume = ttsLipSyncBridge.update();
  // Apply volume to VRM expressions
  vrm.expressionManager.setValue(VRMExpressionPresetName.Aa, volume);
  requestAnimationFrame(animate);
}
```

## Configuration

### LipSync Parameters

Edit `src/renderer/vrm-lip-sync.ts`:

```typescript
const TIME_DOMAIN_DATA_LENGTH = 2048;  // FFT size (higher = better resolution, slower)
const MIN_VOLUME_THRESHOLD = 0.1;      // Noise gate (lower = more sensitive)
```

### Mouth Animation Weights

Edit `src/renderer/components/InternAvatar.tsx` in the animate() function:

```typescript
// Primary: open mouth (aa)
expressionManager?.setValue(VRMExpressionPresetName.Aa, baseVol * 0.8);

// Secondary: subtle movements
expressionManager?.setValue(VRMExpressionPresetName.Ih, baseVol * 0.3 * Math.sin(elapsed * 10));
expressionManager?.setValue(VRMExpressionPresetName.Ou, baseVol * 0.2 * Math.cos(elapsed * 8));
expressionManager?.setValue(VRMExpressionPresetName.Ee, baseVol * 0.2 * Math.sin(elapsed * 12));
```

## Testing

### Enable TTS

Set environment variable:
```bash
export AITERMINAL_KOKORO=1
npm run dev
```

### Test LipSync

1. Open AITerminal
2. Ensure an intern avatar is loaded (e.g., "mei")
3. Trigger TTS (e.g., via voice input or chat)
4. Observe mouth movement during speech

### Debug Logging

Check browser console for:
```
[TTSLipSyncBridge] Initialized with AudioContext
[TTSLipSyncBridge] Playback completed
[useVoiceIO] Playing TTS with lip-sync
```

## Troubleshooting

### Mouth not moving

1. Check browser console for errors
2. Verify AudioContext is initialized (check `ttsLipSyncBridge['audioContext']`)
3. Ensure VRM model supports lip expressions (aa/ih/ou/ee)
4. Check TTS is enabled (`AITERMINAL_KOKORO=1`)

### Audio not playing

1. Check Kokoro Python sidecar is running
2. Verify TTS script exists: `scripts/kokoro-tts-stdio.py`
3. Check Python dependencies: `pip install -r scripts/requirements-kokoro.txt`

### Type errors

Run TypeScript check:
```bash
npm run lint
```

## Performance Notes

- **AudioContext**: Created once per app session
- **AnalyserNode**: Reused across all TTS playback
- **Update loop**: Runs in existing VRM animation loop (no overhead)
- **Memory**: Audio buffers are garbage collected after playback

## Future Enhancements

- [ ] Viseme-based lip sync (more accurate mouth shapes)
- [ ] Phoneme alignment for precise timing
- [ ] Emotional expression blending during speech
- [ ] Volume sensitivity slider in settings
- [ ] Per-intern voice profiles

## References

- ChatVRM: `/tmp/ChatVRM/src/features/vrmViewer/model.ts` (speak() method)
- Web Audio API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
- @pixiv/three-vrm: https://github.com/pixiv/three-vrm
