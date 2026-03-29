/*
 * Path: /Users/ghost/Desktop/aiterminal/src/renderer/components/InternAvatar.tsx
 * Module: renderer/components
 * Purpose: 3D VRM avatar visualizer for interns - displays anime-style avatars with real-time expressions
 * Dependencies: react, three, @pixiv/three-vrm
 * Related: /Users/ghost/Desktop/aiterminal/src/renderer/components/AgentMode.tsx
 * Keywords: vrm, three.js, avatar, anime, intern-visualizer, expressions, 3d-model
 * Last Updated: 2026-03-24
 */

import { useEffect, useRef, useState } from 'react';
import type { AgentEvent } from '../../agent-loop/events';
import { getModelForIntern } from '../vrm-models';
import { getPreloadedVRM } from '../vrm-preloader';
import { AgentSelector } from './AgentSelector';
import { applyEmote, createEmote, isEmoteComplete, resetPose, type EmoteState, type EmoteType } from '../vrm-emotes';
import { ttsLipSyncBridge } from '../vrm-tts-bridge';

// Expression presets from VRM
type VRMExpression = 'neutral' | 'happy' | 'angry' | 'sad' | 'surprised' | 'joy' | 'sorrow' | 'fun' | 'aa' | 'ih' | 'ou' | 'ee' | 'oh' | 'blink';

// Map agent events to expressions AND emotes
const EVENT_TO_EXPRESSION: Record<string, VRMExpression> = {
  // Lifecycle events
  'lifecycle:start': 'neutral',
  'lifecycle:end': 'happy',
  'lifecycle:error': 'sad',

  // Tool events
  'tool:start': 'ou', // Thinking/concentrating face
  'tool:end': 'happy',

  // Assistant events (generating output)
  'assistant:delta': 'aa', // Talking/working

  // Handoff events
  'handoff': 'surprised',

  // Error events
  'error': 'angry'
};

const EVENT_TO_EMOTE: Record<string, { type: EmoteType; duration?: number }> = {
  // Lifecycle emotes
  'lifecycle:start': { type: 'wave', duration: 2000 },           // Wave hello
  'lifecycle:end': { type: 'wave', duration: 1500 },             // Wave goodbye
  'lifecycle:error': { type: 'nod-no', duration: 1000 },         // Shake head

  // Tool emotes
  'tool:start': { type: 'think-pose', duration: 0 },             // Infinite while thinking
  'tool:end': { type: 'happy-bounce', duration: 1500 },         // Celebrate completion

  // Emotion emotes
  'assistant:delta': { type: 'idle' },                          // Idle animation while talking

  // Special emotes
  'handoff': { type: 'clap', duration: 2000 },                   // Celebrate handoff
};

// Idle animations when intern is waiting
const IDLE_EXPRESSIONS: VRMExpression[] = ['neutral', 'blink', 'neutral', 'blink'];
const IDLE_INTERVAL = 3000; // Switch idle expression every 3 seconds

interface InternAvatarProps {
  intern: string | null;
  isRunning: boolean;
  events: AgentEvent[];
  onInternSelect?: (intern: string) => void;
  // Chat interaction state for expression updates
  isStreaming?: boolean;
  hasInput?: boolean;
  // Workspace context
  activeSessionCwd?: string;
  activeSessionId?: string;
  // VRM chat toggle
  showVrmChat?: boolean;
  onToggleVrmChat?: () => void;
  // RP mode
  rpMode?: boolean;
  onToggleRpMode?: () => void;
  activeModel?: string;
  // TTS toggle
  ttsEnabled?: boolean;
  onToggleTts?: () => void;
}

export function InternAvatar({
  intern,
  isRunning,
  events,
  onInternSelect,
  isStreaming = false,
  hasInput = false,
  activeSessionCwd,
  activeSessionId,
  showVrmChat = false,
  onToggleVrmChat,
  rpMode = false,
  onToggleRpMode,
  activeModel,
  ttsEnabled = true,
  onToggleTts,
}: InternAvatarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const vrmRef = useRef<any>(null);
  const vrmInitializedRef = useRef(false); // Track if VRM is initialized to prevent re-renders
  const cursorPositionRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const [currentExpression, setCurrentExpression] = useState<VRMExpression>('neutral');
  const [modelLoaded, setModelLoaded] = useState(false);
  const modelLoadedRef = useRef(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [displayedCwd, setDisplayedCwd] = useState<string | undefined>(activeSessionCwd);
  const [currentEmote, setCurrentEmote] = useState<EmoteState | null>(null);
  const lipSyncVolumeRef = useRef(0); // Track lip-sync volume for mouth animation

  // Use default model if no intern specified
  const currentModel = getModelForIntern(intern);
  const effectiveIntern = intern || 'sora';

  console.log(`[InternAvatar] Rendering intern=${effectiveIntern}, isRunning=${isRunning}, vrmInitialized=${vrmInitializedRef.current}`);

  // Reset VRM initialization when switching interns
  useEffect(() => {
    console.log(`[InternAvatar] Intern changed to ${effectiveIntern}, resetting VRM init flag`);
    vrmInitializedRef.current = false;
    modelLoadedRef.current = false;
    setModelLoaded(false);
    setModelError(null);
  }, [effectiveIntern]);

  // Initialize TTS LipSync bridge when component mounts
  useEffect(() => {
    // Initialize the lip-sync bridge with a new AudioContext
    if (!ttsLipSyncBridge['audioContext']) {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      ttsLipSyncBridge.initialize(audioContext);
      console.log('[InternAvatar] TTS LipSync bridge initialized');
    }

    // Cleanup on unmount
    return () => {
      // Note: Don't dispose here as other components may be using the bridge
      // The bridge is a singleton that persists across component lifecycles
    };
  }, []);

  // Initialize Three.js scene and load VRM
  useEffect(() => {
    // Prevent re-initialization on re-renders
    if (vrmInitializedRef.current) {
      console.log(`[InternAvatar] ⏭️ Skipping VRM init - already initialized for ${effectiveIntern}`);
      return () => {
        // NOOP - don't cleanup on re-render
      };
    }

    console.log(`[InternAvatar] useEffect triggered for ${effectiveIntern}, containerRef.current =`, containerRef.current);

    // Wait for next tick when ref will be available
    const timer = setTimeout(() => {
      const container = containerRef.current;
      if (!container) {
        console.error('[InternAvatar] ❌ containerRef still NULL after setTimeout - ref not set!');
        return;
      }

      console.log(`[InternAvatar] ✅ Container ref available after delay, initializing VRM for ${effectiveIntern}`);

    let cleanup: (() => void) | null = null;

    const initVRM = async () => {
      const container = containerRef.current;
      if (!container) {
        console.error('[InternAvatar] Container ref lost during init!');
        return;
      }

      // Clear previous content
      container.innerHTML = '';

      // CHECK PRELOADER CACHE FIRST — instant display if available!
      console.log(`[InternAvatar] Checking cache for ${effectiveIntern}...`);
      const preloaded = getPreloadedVRM(effectiveIntern);

      // Dynamic import of Three.js (needed in both paths)
      const THREE_module = await import('three');
      const THREE = THREE_module as any;
      const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');

      if (preloaded) {
        console.log(`%c⚡ ${effectiveIntern.toUpperCase()} VRM from cache!`, 'color:#00ff00;font-weight:bold');

        // Extract only the VRM model from cache
        const { vrm: vrmModel, expressionManager, VRMExpressionPresetName } = preloaded;

        // Create FRESH scene/camera/renderer (don't reuse from cache to avoid React DOM conflicts)
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a2e);

        // Camera positioned for facial expressions - ZOOMED IN
        const camera = new THREE.PerspectiveCamera(
          30,
          container.clientWidth / container.clientHeight,
          0.1,
          20
        );
        camera.position.set(0, 1.7, 1.0); // Default, will auto-adjust to head below

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 1.5, 0); // Default, will auto-adjust to head below
        controls.enableZoom = true; // Enable zoom
        controls.enablePan = false; // Pan only with Ctrl+drag
        controls.minDistance = 0.5; // Allow much closer zoom
        controls.maxDistance = 10.0; // Allow zooming out more
        controls.keys = {
          LEFT: '' as any,  // Disable arrow keys
          UP: '' as any,
          RIGHT: '' as any,
          BOTTOM: '' as any
        };

        // Ctrl+drag to pan, regular drag to rotate
        const handleKeyDown = (e: KeyboardEvent) => {
          if (e.ctrlKey || e.metaKey) {
            controls.enablePan = true;
          }
        };
        const handleKeyUp = (e: KeyboardEvent) => {
          if (!e.ctrlKey && !e.metaKey) {
            controls.enablePan = false;
          }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        controls.update();

        // Lighting optimized for face visibility
        const light = new THREE.DirectionalLight(0xffffff, 2.0);
        light.position.set(2, 3, 5);
        scene.add(light);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const fillLight = new THREE.DirectionalLight(0xffeeb1, 0.5);
        fillLight.position.set(-2, 1, 3);
        scene.add(fillLight);

        const rimLight = new THREE.DirectionalLight(0x6688cc, 0.4);
        rimLight.position.set(0, 2, -4);
        scene.add(rimLight);

        // Add VRM model to scene
        // Tilt forward 10 degrees for conversational pose
        vrmModel.scene.rotation.y = Math.PI; // Face forward
        vrmModel.scene.rotation.x = -0.17; // Tilt forward ~10° (conversational pose)
        vrmModel.scene.position.y = 0; // Reset to base, auto-adjust below
        scene.add(vrmModel.scene);

        // Auto-detect head position and adjust camera
        const headBone = vrmModel.humanoid?.getNormalizedBoneNode('head');
        let headPosition = new THREE.Vector3(0, 1.5, 0); // Default fallback

        if (headBone) {
          // Get world position of head bone
          headBone.getWorldPosition(headPosition, new THREE.Vector3(), new THREE.Quaternion());
          console.log(`[InternAvatar] Auto-detected head position:`, headPosition);
        }

        // Position camera relative to detected head position
        camera.position.set(
          headPosition.x,
          headPosition.y,
          headPosition.z + 1.0  // 1 meter in front of face
        );
        controls.target.set(headPosition.x, headPosition.y, headPosition.z);

        // ===== FIX T-POSE: Set natural resting pose =====
        // Store resting pose bones to maintain every frame
        const restingPose = {
          leftUpperArm: vrmModel.humanoid?.getNormalizedBoneNode('leftUpperArm'),
          leftLowerArm: vrmModel.humanoid?.getNormalizedBoneNode('leftLowerArm'),
          leftHand: vrmModel.humanoid?.getNormalizedBoneNode('leftHand'),
          rightUpperArm: vrmModel.humanoid?.getNormalizedBoneNode('rightUpperArm'),
          rightLowerArm: vrmModel.humanoid?.getNormalizedBoneNode('rightLowerArm'),
          rightHand: vrmModel.humanoid?.getNormalizedBoneNode('rightHand'),
          leftShoulder: vrmModel.humanoid?.getNormalizedBoneNode('leftShoulder'),
          rightShoulder: vrmModel.humanoid?.getNormalizedBoneNode('rightShoulder'),
        };

        // Debug: Log which bones exist
        console.log('[InternAvatar] Available bones:', {
          hasLeftUpperArm: !!restingPose.leftUpperArm,
          hasRightUpperArm: !!restingPose.rightUpperArm,
          hasLeftLowerArm: !!restingPose.leftLowerArm,
          hasRightLowerArm: !!restingPose.rightLowerArm,
          hasLeftShoulder: !!restingPose.leftShoulder,
          hasRightShoulder: !!restingPose.rightShoulder,
        });

        // Create animation mixer and play idle animation
        const mixer = new THREE.AnimationMixer(vrmModel.scene);
        const clock = new THREE.Clock();

        // Try to play idle animation if available
        const animations = vrmModel.scene.animations;
        if (animations && animations.length > 0) {
          console.log(`[InternAvatar] Found ${animations.length} animations in VRM model`);
          // Find idle animation or use first animation
          const idleAnimation = animations.find((a: any) => a.name.toLowerCase().includes('idle')) || animations[0];
          if (idleAnimation) {
            const action = mixer.clipAction(idleAnimation);
            action.play();
            console.log(`[InternAvatar] Playing animation: ${idleAnimation.name}`);
          }
        } else {
          console.log('[InternAvatar] No animations found in VRM model');
        }

        vrmRef.current = {
          vrm: vrmModel,
          expressionManager,
          VRMExpressionPresetName,
          scene,
          camera,
          renderer,
          controls,
          mixer,
          clock,
          restingPose
        };

        vrmInitializedRef.current = true;
        modelLoadedRef.current = true;
        setModelLoaded(true);
        console.log(`%c✅ ${effectiveIntern.toUpperCase()} VRM loaded instantly!`, 'color:#ff66aa;font-weight:bold');

        // Set initial expression
        vrmModel.expressionManager.setValue(VRMExpressionPresetName.Neutral, 1);

        // Animation loop
        let idleTimer = 0;
        let idleIndex = 0;
        let blinkTimer = 0;
        let isBlinking = false;

        const animate = () => {
          requestAnimationFrame(animate);
          const delta = clock.getDelta();
          const elapsed = clock.getElapsedTime();

          if (vrmModel) {
            vrmModel.update(delta);
            mixer.update(delta); // Update VRM animations

            // ===== LIP SYNC: Update mouth animation during TTS playback =====
            const lipSyncVolume = ttsLipSyncBridge.update();
            lipSyncVolumeRef.current = lipSyncVolume;

            // Apply lip-sync volume to VRM mouth expressions
            // Use a combination of aa/ih/ou/ee for natural mouth movement
            if (lipSyncVolume > 0.01) {
              const { expressionManager, VRMExpressionPresetName } = vrmRef.current;

              // Apply volume-based lip animation
              // Distribute across multiple mouth shapes for natural speech
              const baseVol = lipSyncVolume;

              // Primary: open mouth (aa) with full volume
              expressionManager?.setValue(VRMExpressionPresetName.Aa, baseVol * 0.8);

              // Secondary: subtle mouth movements (ih/ou/ee) for variation
              expressionManager?.setValue(VRMExpressionPresetName.Ih, baseVol * 0.3 * Math.sin(elapsed * 10));
              expressionManager?.setValue(VRMExpressionPresetName.Ou, baseVol * 0.2 * Math.cos(elapsed * 8));
              expressionManager?.setValue(VRMExpressionPresetName.Ee, baseVol * 0.2 * Math.sin(elapsed * 12));
            } else {
              // Clear lip expressions when not speaking
              const { expressionManager, VRMExpressionPresetName } = vrmRef.current;
              expressionManager?.setValue(VRMExpressionPresetName.Aa, 0);
              expressionManager?.setValue(VRMExpressionPresetName.Ih, 0);
              expressionManager?.setValue(VRMExpressionPresetName.Ou, 0);
              expressionManager?.setValue(VRMExpressionPresetName.Ee, 0);
            }

            // ===== APPLY EMOTE ANIMATIONS =====
            if (currentEmote) {
              const emoteElapsed = (Date.now() - currentEmote.startTime) / 1000;
              applyEmote(vrmModel, currentEmote, emoteElapsed);

              // Check if emote is complete
              if (isEmoteComplete(currentEmote)) {
                console.log(`[InternAvatar] Emote complete: ${currentEmote.type}`);
                resetPose(vrmModel); // Reset to resting pose
                setCurrentEmote(null); // Clear emote
              }
            }

            // ===== PROCEDURAL IDLE ANIMATIONS =====
            if (vrmModel.humanoid) {
              // Breathing animation - chest and spine
              const breathIntensity = 0.04;
              const breathSpeed = 1.5;
              const breath = Math.sin(elapsed * breathSpeed) * breathIntensity;

              // Apply breathing to chest
              const chest = vrmModel.humanoid.getNormalizedBoneNode('chest');
              if (chest) {
                chest.rotation.x = breath * 0.7;
              }

              // Apply subtle breathing to spine
              const spine = vrmModel.humanoid.getNormalizedBoneNode('spine');
              if (spine) {
                spine.rotation.x = breath * 0.3;
              }

              // ===== HEAD FOLLOWS CURSOR =====
              const head = vrmModel.humanoid?.getNormalizedBoneNode('head');
              if (head) {
                // Get latest cursor position from ref (not state, to avoid closure issues)
                const currentCursor = cursorPositionRef.current;

                // Get avatar canvas position on screen to calculate relative center
                // CRITICAL: Use containerRef.current, not cached container variable!
                const currentContainer = containerRef.current;
                if (!currentContainer) return;
                const rect = currentContainer.getBoundingClientRect();
                const canvasCenterX = rect.left + rect.width / 2;
                const canvasCenterY = rect.top + rect.height / 2;

                // Calculate cursor position relative to avatar canvas center
                const deltaX = currentCursor.x - canvasCenterX;
                const deltaY = currentCursor.y - canvasCenterY;

                // Calculate head rotation to look at cursor
                const maxYaw = 0.6; // ~35 degrees left/right
                const maxPitch = 0.25; // ~15 degrees up/down

                // Normalize based on canvas size for proportional tracking
                const maxDistance = Math.max(rect.width, rect.height);
                const normalizedX = Math.max(-1, Math.min(1, deltaX / (maxDistance / 2)));
                const normalizedY = Math.max(-1, Math.min(1, deltaY / (maxDistance / 2)));

                // Calculate target rotations
                const targetYaw = normalizedX * maxYaw;
                const targetPitch = -normalizedY * maxPitch;

                // Smooth interpolation (LERP) for natural movement
                const lerpFactor = 0.1; // Smooth but responsive
                head.rotation.y += (targetYaw - head.rotation.y) * lerpFactor;
                head.rotation.x += (targetPitch - head.rotation.x) * lerpFactor;
              }

              // Arm sway - adds life while maintaining resting pose
              const armSwayIntensity = 0.015;
              const armSwaySpeed = 1.0;
              const armSway = Math.sin(elapsed * armSwaySpeed) * armSwayIntensity;

              // ===== MAINTAIN RESTING POSE EVERY FRAME =====
              // T-pose has arms horizontal - need Z-axis rotation to bring them DOWN
              if (restingPose.leftShoulder) {
                restingPose.leftShoulder.rotation.x = 0.1;
              }
              if (restingPose.rightShoulder) {
                restingPose.rightShoulder.rotation.x = 0.1;
              }

              // Left arm - rotate DOWN from T-pose (Z-axis: horizontal → vertical)
              if (restingPose.leftUpperArm) {
                restingPose.leftUpperArm.rotation.set(
                  0,  // x
                  0,  // y
                  1.3 + armSway  // z - bring arm down to side (~75°)
                );
              }

              // Right arm - rotate DOWN from T-pose
              if (restingPose.rightUpperArm) {
                restingPose.rightUpperArm.rotation.set(
                  0,  // x
                  0,  // y
                  -1.3 - armSway  // z - bring arm down to side (~75°)
                );
              }

              // Lower arms - bend at elbow
              if (restingPose.leftLowerArm) {
                restingPose.leftLowerArm.rotation.x = 0.3 + Math.sin(elapsed * 0.9) * 0.02;
              }
              if (restingPose.rightLowerArm) {
                restingPose.rightLowerArm.rotation.x = 0.3 + Math.cos(elapsed * 0.9) * 0.02;
              }

              // Hands - relaxed wrists
              if (restingPose.leftHand) {
                restingPose.leftHand.rotation.z = 0.5;
              }
              if (restingPose.rightHand) {
                restingPose.rightHand.rotation.z = -0.5;
              }

              // Very subtle body sway
              const hips = vrmModel.humanoid.getNormalizedBoneNode('hips');
              if (hips) {
                hips.rotation.y = Math.sin(elapsed * 0.5) * 0.01;
              }
            }

            // ===== AUTOMATIC BLINKING =====
            blinkTimer += delta;
            if (!isBlinking && blinkTimer > 3 + Math.random() * 2) {
              // Start blink
              isBlinking = true;
              blinkTimer = 0;

              // Quick blink animation
              let blinkProgress = 0;
              const blinkDuration = 0.15; // 150ms blink

              const doBlink = () => {
                blinkProgress += delta;
                const blinkValue = Math.sin(blinkProgress / blinkDuration * Math.PI);

                vrmModel.expressionManager.setValue(VRMExpressionPresetName.Blink, blinkValue);

                if (blinkProgress < blinkDuration) {
                  requestAnimationFrame(doBlink);
                } else {
                  isBlinking = false;
                  vrmModel.expressionManager.setValue(VRMExpressionPresetName.Blink, 0);
                }
              };
              doBlink();
            }

            // Idle expression cycling (when not interacting)
            if (!isStreaming && !hasInput && !isRunning) {
              idleTimer += delta * 1000;
              if (idleTimer > IDLE_INTERVAL) {
                idleTimer = 0;
                idleIndex = (idleIndex + 1) % IDLE_EXPRESSIONS.length;
                const idleExpr = IDLE_EXPRESSIONS[idleIndex];
                // Apply idle expression subtly
                if (idleExpr === 'blink') {
                  // Skip since we have automatic blinking
                } else if (idleExpr === 'neutral') {
                  Object.values(VRMExpressionPresetName).forEach((preset: any) => {
                    vrmModel.expressionManager.setValue(preset, 0);
                  });
                  vrmModel.expressionManager.setValue(VRMExpressionPresetName.Neutral, 1);
                }
              }
            }
          }

          controls.update();
          renderer.render(scene, camera);
        };

        animate();

        // Handle resize
        const handleResize = () => {
          const currentContainer = containerRef.current;
          if (!currentContainer) return;
          camera.aspect = currentContainer.clientWidth / currentContainer.clientHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(currentContainer.clientWidth, currentContainer.clientHeight);
        };
        window.addEventListener('resize', handleResize);

        // Track cursor position for head-following (works from anywhere in the app)
        const handleMouseMove = (e: MouseEvent) => {
          // Use client coordinates directly (relative to viewport)
          cursorPositionRef.current = { x: e.clientX, y: e.clientY };
        };
        document.addEventListener('mousemove', handleMouseMove);

        cleanup = () => {
          window.removeEventListener('resize', handleResize);
          window.removeEventListener('keydown', handleKeyDown);
          window.removeEventListener('keyup', handleKeyUp);
          document.removeEventListener('mousemove', handleMouseMove);
          // Dispose renderer but let React handle DOM cleanup
          if (renderer.domElement && renderer.domElement.parentNode) {
            renderer.domElement.parentNode.removeChild(renderer.domElement);
          }
          renderer.dispose();
        };

        return; // DONE — instant load complete!
      }

      // FALLBACK: Load on-demand if not preloaded
      console.log(`[InternAvatar] No cached VRM for ${effectiveIntern}, loading on-demand...`);

      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const { VRMLoaderPlugin, VRMUtils, VRMExpressionPresetName } = await import('@pixiv/three-vrm');

      // Scene setup with theme-based background
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x1a1a2e); // Dark blue background

      const camera = new THREE.PerspectiveCamera(
        30,
        container.clientWidth / container.clientHeight,
        0.1,
        20
      );
      camera.position.set(0, 1.7, 1.0); // Eye level for natural framing

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setPixelRatio(window.devicePixelRatio);
      container.appendChild(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 1.5, 0); // Focus on face level
      controls.enableZoom = true; // Enable zoom
      controls.enablePan = false; // Pan only with Ctrl+drag
      controls.minDistance = 0.5; // Allow much closer zoom
      controls.maxDistance = 10.0; // Allow zooming out more
      controls.keys = {
        LEFT: '' as any,  // Disable arrow keys
        UP: '' as any,
        RIGHT: '' as any,
        BOTTOM: '' as any
      };

      // Ctrl+drag to pan, regular drag to rotate
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.ctrlKey || e.metaKey) {
          controls.enablePan = true;
        }
      };
      const handleKeyUp = (e: KeyboardEvent) => {
        if (!e.ctrlKey && !e.metaKey) {
          controls.enablePan = false;
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);

      controls.update();

      // Lighting optimized for face visibility
      const light = new THREE.DirectionalLight(0xffffff, 2.0);
      light.position.set(2, 3, 5);
      scene.add(light);

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      scene.add(ambientLight);

      const fillLight = new THREE.DirectionalLight(0xffeeb1, 0.5);
      fillLight.position.set(-2, 1, 3);
      scene.add(fillLight);

      const rimLight = new THREE.DirectionalLight(0x6688cc, 0.4);
      rimLight.position.set(0, 2, -4);
      scene.add(rimLight);

      // Load VRM model from config
      const loader = new GLTFLoader();
      loader.crossOrigin = 'anonymous'; // CRITICAL: Set CORS for VRM loading
      loader.register((parser: any) => new VRMLoaderPlugin(parser));

      const vrmUrl = currentModel.url;

      // Timeout: fail fast if VRM doesn't load (likely invalid VRM)
      const timeoutId = setTimeout(() => {
        if (!modelLoadedRef.current) {
          console.warn(`[InternAvatar] VRM load timeout/failure for ${effectiveIntern}`);
          setModelError('VRM model could not be loaded. This is usually because the model is missing proper VRM humanoid bone mappings.');
        }
      }, 3000);

      try {
        const gltf = await new Promise<any>((resolve, reject) => {
          loader.load(
            vrmUrl,
            resolve,
            (progress: any) => {
              const percent = Math.round((progress.loaded / progress.total) * 100);
              console.log(`[InternAvatar] Loading VRM for ${effectiveIntern}... ${percent}%`);
            },
            (error: any) => {
              console.error(`[InternAvatar] GLTFLoader error:`, error);
              reject(error);
            }
          );
        });

        const vrmModel = gltf.userData.vrm;
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.combineSkeletons(gltf.scene);
        VRMUtils.combineMorphs(vrmModel);

        // Disable frustum culling (CRITICAL for VRM rendering)
        vrmModel.scene.traverse((obj: any) => {
          obj.frustumCulled = false;
        });

        vrmModel.scene.rotation.y = Math.PI; // Face forward
        vrmModel.scene.rotation.x = -0.17; // Tilt forward ~10° (conversational pose)
        vrmModel.scene.position.y = 0; // Reset to base, auto-adjust below
        scene.add(vrmModel.scene);

        // Auto-detect head position and adjust camera
        const headBone = vrmModel.humanoid?.getNormalizedBoneNode('head');
        let headPosition = new THREE.Vector3(0, 1.5, 0); // Default fallback

        if (headBone) {
          // Get world position of head bone
          headBone.getWorldPosition(headPosition, new THREE.Vector3(), new THREE.Quaternion());
          console.log(`[InternAvatar] Auto-detected head position:`, headPosition);
        }

        // Position camera relative to detected head position
        camera.position.set(
          headPosition.x,
          headPosition.y,
          headPosition.z + 1.0  // 1 meter in front of face
        );
        controls.target.set(headPosition.x, headPosition.y, headPosition.z);

        // ===== FIX T-POSE: Set natural resting pose =====
        // Store resting pose bones to maintain every frame
        const restingPose = {
          leftUpperArm: vrmModel.humanoid?.getNormalizedBoneNode('leftUpperArm'),
          leftLowerArm: vrmModel.humanoid?.getNormalizedBoneNode('leftLowerArm'),
          leftHand: vrmModel.humanoid?.getNormalizedBoneNode('leftHand'),
          rightUpperArm: vrmModel.humanoid?.getNormalizedBoneNode('rightUpperArm'),
          rightLowerArm: vrmModel.humanoid?.getNormalizedBoneNode('rightLowerArm'),
          rightHand: vrmModel.humanoid?.getNormalizedBoneNode('rightHand'),
          leftShoulder: vrmModel.humanoid?.getNormalizedBoneNode('leftShoulder'),
          rightShoulder: vrmModel.humanoid?.getNormalizedBoneNode('rightShoulder'),
        };

        // Debug: Log which bones exist
        console.log('[InternAvatar] Available bones:', {
          hasLeftUpperArm: !!restingPose.leftUpperArm,
          hasRightUpperArm: !!restingPose.rightUpperArm,
          hasLeftLowerArm: !!restingPose.leftLowerArm,
          hasRightLowerArm: !!restingPose.rightLowerArm,
          hasLeftShoulder: !!restingPose.leftShoulder,
          hasRightShoulder: !!restingPose.rightShoulder,
        });

        // Create animation mixer and play idle animation
        const mixer = new THREE.AnimationMixer(vrmModel.scene);
        const clock = new THREE.Clock();

        // Try to play idle animation if available
        const animations = vrmModel.scene.animations;
        if (animations && animations.length > 0) {
          console.log(`[InternAvatar] Found ${animations.length} animations in VRM model`);
          const idleAnimation = animations.find((a: any) => a.name.toLowerCase().includes('idle')) || animations[0];
          if (idleAnimation) {
            const action = mixer.clipAction(idleAnimation);
            action.play();
            console.log(`[InternAvatar] Playing animation: ${idleAnimation.name}`);
          }
        } else {
          console.log('[InternAvatar] No animations found in VRM model');
        }

        vrmRef.current = {
          vrm: vrmModel,
          expressionManager: vrmModel.expressionManager,
          VRMExpressionPresetName,
          scene,
          camera,
          renderer,
          controls,
          mixer,
          clock
        };

        vrmInitializedRef.current = true;
        modelLoadedRef.current = true;
        setModelLoaded(true);
        console.log(`%c✅ ${effectiveIntern.toUpperCase()} VRM loaded!`, 'color:#ff66aa;font-weight:bold');

        // Set initial expression
        vrmModel.expressionManager.setValue(VRMExpressionPresetName.Neutral, 1);

        // Animation loop
        let idleTimer = 0;
        let idleIndex = 0;
        let blinkTimer = 0;
        let isBlinking = false;

        const animate = () => {
          requestAnimationFrame(animate);
          const delta = clock.getDelta();
          const elapsed = clock.getElapsedTime();

          if (vrmModel) {
            vrmModel.update(delta);
            mixer.update(delta); // Update VRM animations

            // ===== LIP SYNC: Update mouth animation during TTS playback =====
            const lipSyncVolume = ttsLipSyncBridge.update();
            lipSyncVolumeRef.current = lipSyncVolume;

            // Apply lip-sync volume to VRM mouth expressions
            // Use a combination of aa/ih/ou/ee for natural mouth movement
            if (lipSyncVolume > 0.01) {
              const { expressionManager, VRMExpressionPresetName } = vrmRef.current;

              // Apply volume-based lip animation
              // Distribute across multiple mouth shapes for natural speech
              const baseVol = lipSyncVolume;

              // Primary: open mouth (aa) with full volume
              expressionManager?.setValue(VRMExpressionPresetName.Aa, baseVol * 0.8);

              // Secondary: subtle mouth movements (ih/ou/ee) for variation
              expressionManager?.setValue(VRMExpressionPresetName.Ih, baseVol * 0.3 * Math.sin(elapsed * 10));
              expressionManager?.setValue(VRMExpressionPresetName.Ou, baseVol * 0.2 * Math.cos(elapsed * 8));
              expressionManager?.setValue(VRMExpressionPresetName.Ee, baseVol * 0.2 * Math.sin(elapsed * 12));
            } else {
              // Clear lip expressions when not speaking
              const { expressionManager, VRMExpressionPresetName } = vrmRef.current;
              expressionManager?.setValue(VRMExpressionPresetName.Aa, 0);
              expressionManager?.setValue(VRMExpressionPresetName.Ih, 0);
              expressionManager?.setValue(VRMExpressionPresetName.Ou, 0);
              expressionManager?.setValue(VRMExpressionPresetName.Ee, 0);
            }

            // ===== APPLY EMOTE ANIMATIONS =====
            if (currentEmote) {
              const emoteElapsed = (Date.now() - currentEmote.startTime) / 1000;
              applyEmote(vrmModel, currentEmote, emoteElapsed);

              // Check if emote is complete
              if (isEmoteComplete(currentEmote)) {
                console.log(`[InternAvatar] Emote complete: ${currentEmote.type}`);
                resetPose(vrmModel); // Reset to resting pose
                setCurrentEmote(null); // Clear emote
              }
            }

            // ===== PROCEDURAL IDLE ANIMATIONS =====
            if (vrmModel.humanoid) {
              // Breathing animation - chest and spine
              const breathIntensity = 0.04;
              const breathSpeed = 1.5;
              const breath = Math.sin(elapsed * breathSpeed) * breathIntensity;

              // Apply breathing to chest
              const chest = vrmModel.humanoid.getNormalizedBoneNode('chest');
              if (chest) {
                chest.rotation.x = breath * 0.7;
              }

              // Apply subtle breathing to spine
              const spine = vrmModel.humanoid.getNormalizedBoneNode('spine');
              if (spine) {
                spine.rotation.x = breath * 0.3;
              }

              // ===== HEAD FOLLOWS CURSOR =====
              const head = vrmModel.humanoid?.getNormalizedBoneNode('head');
              if (head) {
                // Get latest cursor position from ref (not state, to avoid closure issues)
                const currentCursor = cursorPositionRef.current;

                // Get avatar canvas position on screen to calculate relative center
                // CRITICAL: Use containerRef.current, not cached container variable!
                const currentContainer = containerRef.current;
                if (!currentContainer) return;
                const rect = currentContainer.getBoundingClientRect();
                const canvasCenterX = rect.left + rect.width / 2;
                const canvasCenterY = rect.top + rect.height / 2;

                // Calculate cursor position relative to avatar canvas center
                const deltaX = currentCursor.x - canvasCenterX;
                const deltaY = currentCursor.y - canvasCenterY;

                // Calculate head rotation to look at cursor
                const maxYaw = 0.6; // ~35 degrees left/right
                const maxPitch = 0.25; // ~15 degrees up/down

                // Normalize based on canvas size for proportional tracking
                const maxDistance = Math.max(rect.width, rect.height);
                const normalizedX = Math.max(-1, Math.min(1, deltaX / (maxDistance / 2)));
                const normalizedY = Math.max(-1, Math.min(1, deltaY / (maxDistance / 2)));

                // Calculate target rotations
                const targetYaw = normalizedX * maxYaw;
                const targetPitch = -normalizedY * maxPitch;

                // Smooth interpolation (LERP) for natural movement
                const lerpFactor = 0.1; // Smooth but responsive
                head.rotation.y += (targetYaw - head.rotation.y) * lerpFactor;
                head.rotation.x += (targetPitch - head.rotation.x) * lerpFactor;
              }

              // Arm sway - adds life while maintaining resting pose
              const armSwayIntensity = 0.015;
              const armSwaySpeed = 1.0;
              const armSway = Math.sin(elapsed * armSwaySpeed) * armSwayIntensity;

              // ===== MAINTAIN RESTING POSE EVERY FRAME =====
              // T-pose has arms horizontal - need Z-axis rotation to bring them DOWN
              if (restingPose.leftShoulder) {
                restingPose.leftShoulder.rotation.x = 0.1;
              }
              if (restingPose.rightShoulder) {
                restingPose.rightShoulder.rotation.x = 0.1;
              }

              // Left arm - rotate DOWN from T-pose (Z-axis: horizontal → vertical)
              if (restingPose.leftUpperArm) {
                restingPose.leftUpperArm.rotation.set(
                  0,  // x
                  0,  // y
                  1.3 + armSway  // z - bring arm down to side (~75°)
                );
              }

              // Right arm - rotate DOWN from T-pose
              if (restingPose.rightUpperArm) {
                restingPose.rightUpperArm.rotation.set(
                  0,  // x
                  0,  // y
                  -1.3 - armSway  // z - bring arm down to side (~75°)
                );
              }

              // Lower arms - bend at elbow
              if (restingPose.leftLowerArm) {
                restingPose.leftLowerArm.rotation.x = 0.3 + Math.sin(elapsed * 0.9) * 0.02;
              }
              if (restingPose.rightLowerArm) {
                restingPose.rightLowerArm.rotation.x = 0.3 + Math.cos(elapsed * 0.9) * 0.02;
              }

              // Hands - relaxed wrists
              if (restingPose.leftHand) {
                restingPose.leftHand.rotation.z = 0.5;
              }
              if (restingPose.rightHand) {
                restingPose.rightHand.rotation.z = -0.5;
              }

              // Very subtle body sway
              const hips = vrmModel.humanoid.getNormalizedBoneNode('hips');
              if (hips) {
                hips.rotation.y = Math.sin(elapsed * 0.5) * 0.01;
              }
            }

            // ===== AUTOMATIC BLINKING =====
            blinkTimer += delta;
            if (!isBlinking && blinkTimer > 3 + Math.random() * 2) {
              // Start blink
              isBlinking = true;
              blinkTimer = 0;

              // Quick blink animation
              let blinkProgress = 0;
              const blinkDuration = 0.15; // 150ms blink

              const doBlink = () => {
                blinkProgress += delta;
                const blinkValue = Math.sin(blinkProgress / blinkDuration * Math.PI);

                vrmModel.expressionManager.setValue(VRMExpressionPresetName.Blink, blinkValue);

                if (blinkProgress < blinkDuration) {
                  requestAnimationFrame(doBlink);
                } else {
                  isBlinking = false;
                  vrmModel.expressionManager.setValue(VRMExpressionPresetName.Blink, 0);
                }
              };
              doBlink();
            }

            // Idle expression cycling (when not interacting)
            if (!isStreaming && !hasInput && !isRunning) {
              idleTimer += delta * 1000;
              if (idleTimer > IDLE_INTERVAL) {
                idleTimer = 0;
                idleIndex = (idleIndex + 1) % IDLE_EXPRESSIONS.length;
                const idleExpr = IDLE_EXPRESSIONS[idleIndex];
                // Apply idle expression subtly
                if (idleExpr === 'blink') {
                  // Skip since we have automatic blinking
                } else if (idleExpr === 'neutral') {
                  Object.values(VRMExpressionPresetName).forEach((preset: any) => {
                    vrmModel.expressionManager.setValue(preset, 0);
                  });
                  vrmModel.expressionManager.setValue(VRMExpressionPresetName.Neutral, 1);
                }
              }
            }
          }

          controls.update();
          renderer.render(scene, camera);
        };

        animate();

        // Handle resize
        const handleResize = () => {
          const currentContainer = containerRef.current;
          if (!currentContainer) return;
          camera.aspect = currentContainer.clientWidth / currentContainer.clientHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(currentContainer.clientWidth, currentContainer.clientHeight);
        };
        window.addEventListener('resize', handleResize);

        // Track cursor position for head-following (works from anywhere in the app)
        const handleMouseMove = (e: MouseEvent) => {
          // Use client coordinates directly (relative to viewport)
          cursorPositionRef.current = { x: e.clientX, y: e.clientY };
        };
        document.addEventListener('mousemove', handleMouseMove);

        cleanup = () => {
          window.removeEventListener('resize', handleResize);
          window.removeEventListener('keydown', handleKeyDown);
          window.removeEventListener('keyup', handleKeyUp);
          // Dispose renderer but let React handle DOM cleanup
          if (renderer.domElement && renderer.domElement.parentNode) {
            renderer.domElement.parentNode.removeChild(renderer.domElement);
          }
          renderer.dispose();
          clearTimeout(timeoutId);
        };

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to load VRM model';
        console.error(`[InternAvatar] Failed to load VRM for ${effectiveIntern}:`, error);
        console.error(`[InternAvatar] URL attempted: ${vrmUrl}`);
        setModelLoaded(false);
        setModelError(errorMessage);
        clearTimeout(timeoutId);
      }
    };

    initVRM();

    return () => {
      if (cleanup) cleanup();
      if (vrmRef.current?.renderer) {
        vrmRef.current.renderer.dispose();
      }
    };

    // End of initVRM scope
    }, 0); // End of setTimeout

    return () => clearTimeout(timer);
  }, [effectiveIntern, currentModel]);

  // Trigger Three.js resize when RP mode toggles (canvas was sized for different layout)
  useEffect(() => {
    if (!vrmRef.current) return;
    // Fire multiple resize events as CSS layout settles
    const timers = [50, 150, 300].map(delay =>
      setTimeout(() => window.dispatchEvent(new Event('resize')), delay)
    );
    return () => timers.forEach(clearTimeout);
  }, [rpMode]);

  // Update expression based on latest event
  useEffect(() => {
    if (!vrmRef.current || events.length === 0) return;

    const { expressionManager, VRMExpressionPresetName } = vrmRef.current;
    const latestEvent = events[events.length - 1];

    if (!latestEvent) return;

    // Determine expression from event
    let eventKey = latestEvent.stream;

    // Safely access event data properties
    if (latestEvent.data && typeof latestEvent.data === 'object') {
      const data = latestEvent.data as any;
      if (data.phase) eventKey += `:${data.phase}`;
      else if (data.status) eventKey += `:${data.status}`;
    }

    const expressionName = EVENT_TO_EXPRESSION[eventKey] ||
                           EVENT_TO_EXPRESSION[latestEvent.stream] ||
                           'neutral';

    // Apply expression
    Object.values(VRMExpressionPresetName).forEach((preset: any) => {
      expressionManager.setValue(preset, 0);
    });

    const preset = (VRMExpressionPresetName as any)[expressionName.charAt(0).toUpperCase() + expressionName.slice(1)];
    if (preset) {
      expressionManager.setValue(preset, 0.9);
      setCurrentExpression(expressionName as VRMExpression);
    }

    // Auto-reset to neutral after 3 seconds
    const timer = setTimeout(() => {
      if (vrmRef.current && !isRunning && !isStreaming) {
        Object.values(VRMExpressionPresetName).forEach((preset: any) => {
          vrmRef.current.expressionManager.setValue(preset, 0);
        });
        vrmRef.current.expressionManager.setValue(VRMExpressionPresetName.Neutral, 1);
        setCurrentExpression('neutral');
      }
    }, 3000);

    return () => clearTimeout(timer);

  }, [events, isRunning, isStreaming]);

  // Trigger emotes based on agent events
  useEffect(() => {
    if (!vrmRef.current || events.length === 0) return;

    const latestEvent = events[events.length - 1];
    if (!latestEvent) return;

    // Get emote config for this event
    let eventKey = latestEvent.stream;

    // Safely access event data properties
    if (latestEvent.data && typeof latestEvent.data === 'object') {
      const data = latestEvent.data as any;
      if (data.phase) eventKey += `:${data.phase}`;
      else if (data.status) eventKey += `:${data.status}`;
    }

    const emoteConfig = EVENT_TO_EMOTE[eventKey] ||
                        EVENT_TO_EMOTE[latestEvent.stream];

    if (emoteConfig) {
      console.log(`[InternAvatar] Triggering emote: ${emoteConfig.type}`);
      const newEmote = createEmote(emoteConfig.type, emoteConfig.duration);
      setCurrentEmote(newEmote);
    }

  }, [events]);

  // Apply active emote in animation loop
  useEffect(() => {
    if (!vrmRef.current) return;

    const { expressionManager, VRMExpressionPresetName } = vrmRef.current;

    // Chat state takes priority for expressions
    if (isStreaming) {
      // AI is responding - look happy/engaged
      Object.values(VRMExpressionPresetName).forEach((preset: any) => {
        expressionManager.setValue(preset, 0);
      });
      expressionManager.setValue(VRMExpressionPresetName.Happy, 0.8);
      setCurrentExpression('happy');
    } else if (hasInput) {
      // User is typing - look thoughtful/concentrating
      Object.values(VRMExpressionPresetName).forEach((preset: any) => {
        expressionManager.setValue(preset, 0);
      });
      expressionManager.setValue(VRMExpressionPresetName.Aa, 0.6);
      setCurrentExpression('aa');
    } else if (!isRunning) {
      // Idle - reset to neutral
      Object.values(VRMExpressionPresetName).forEach((preset: any) => {
        expressionManager.setValue(preset, 0);
      });
      expressionManager.setValue(VRMExpressionPresetName.Neutral, 1);
      setCurrentExpression('neutral');
    }

  }, [isStreaming, hasInput, isRunning]);

  // Subscribe to CWD changes for active session
  useEffect(() => {
    if (!activeSessionId) return;

    const hasElectronAPI =
      typeof window !== 'undefined' &&
      'electronAPI' in window &&
      window.electronAPI?.onSessionCwdChanged;

    if (!hasElectronAPI) return;

    // Update displayed CWD when prop changes
    if (activeSessionCwd) {
      setDisplayedCwd(activeSessionCwd);
    }

    // Listen for real-time CWD changes
    const unsubscribe = window.electronAPI.onSessionCwdChanged?.(({ sessionId, cwd }) => {
      if (sessionId === activeSessionId) {
        setDisplayedCwd(cwd);
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [activeSessionId, activeSessionCwd]);

  // Helper to shorten path for display
  const shortenPath = (path: string | undefined): string | undefined => {
    if (!path) return undefined;
    const parts = path.split('/');
    const lastPart = parts[parts.length - 1];
    return lastPart || path;
  };

  if (!intern) {
    return (
      <div className="intern-avatar offline">
        <div className="avatar-placeholder">
          <div className="avatar-icon">{currentModel.emoji}</div>
          <p className="avatar-text">{currentModel.displayName} ready</p>
          <p className="avatar-description">{currentModel.description}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="intern-avatar">
      {/* Header with model info and agent selector — hidden in RP mode */}
      <div
        className="avatar-header"
        onMouseEnter={rpMode ? undefined : () => setShowTooltip(true)}
        onMouseLeave={rpMode ? undefined : () => setShowTooltip(false)}
        style={rpMode ? { display: 'none' } : undefined}
      >
        <div className="avatar-info">
          {onInternSelect ? (
            <AgentSelector
              selectedIntern={intern}
              onSelectIntern={onInternSelect}
            />
          ) : (
            <>
              <span className="intern-emoji">{currentModel.emoji}</span>
              <span className="intern-name" style={{ color: currentModel.color }}>
                {currentModel.displayName}
              </span>
            </>
          )}
        </div>
        <div className="avatar-controls">
          {onToggleRpMode && (
            rpMode ? (
              <button
                className="chat-toggle active"
                onClick={onToggleRpMode}
                title="End conversation"
                style={{
                  background: 'rgba(255, 55, 55, 0.4)',
                  borderColor: 'rgba(255, 55, 55, 0.6)',
                  color: '#ff5555',
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '4px 10px',
                  letterSpacing: '0.05em',
                }}
              >
                End
              </button>
            ) : (
              <button
                className="chat-toggle"
                onClick={onToggleRpMode}
                title="Enter RP mode"
              >
                🎭
              </button>
            )
          )}
          {onToggleTts && (
            <button
              className={`chat-toggle ${ttsEnabled ? 'active' : ''}`}
              onClick={onToggleTts}
              title={ttsEnabled ? 'Mute TTS' : 'Unmute TTS'}
              style={!ttsEnabled ? { opacity: 0.4 } : undefined}
            >
              {ttsEnabled ? '🔊' : '🔇'}
            </button>
          )}
          {onToggleVrmChat && (
            <button
              className={`chat-toggle ${showVrmChat ? 'active' : ''}`}
              onClick={onToggleVrmChat}
              title={showVrmChat ? 'Hide chat' : 'Show chat'}
            >
              💬
            </button>
          )}
          {activeModel && (
            <span style={{
              fontSize: '9px',
              color: rpMode ? '#ff6b9d' : 'rgba(255,255,255,0.4)',
              fontWeight: 600,
              letterSpacing: '0.03em',
              maxWidth: '80px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {activeModel}
            </span>
          )}
          <span className={`status-indicator ${isRunning ? 'running' : 'idle'}`}>
            {isRunning ? '● Working' : '○ Idle'}
          </span>
        </div>
      </div>

      {/* Workspace Context Display */}
      {displayedCwd && (
        <div className="avatar-context">
          <div className="context-cwd">
            <span className="context-icon">📁</span>
            <span className="context-path" title={displayedCwd}>
              {shortenPath(displayedCwd)}
            </span>
          </div>
        </div>
      )}

      {/* Tooltip */}
      {showTooltip && (
        <div className="avatar-tooltip" style={{ borderColor: currentModel.color }}>
          <div className="tooltip-content">
            <strong>{currentModel.displayName}</strong>
            <p>{currentModel.description}</p>
            <div className="tooltip-specialties">
              {currentModel.specialties.map(s => (
                <span key={s} className="specialty-tag">{s}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* VRM Canvas */}
      <div
        key={`vrm-canvas-${effectiveIntern}`}
        ref={containerRef}
        className="vrm-canvas-container"
      >
        <div className="loading-overlay" style={{
          position: 'absolute',
          inset: 0,
          display: modelLoaded || modelError ? 'none' : 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.8)',
          borderRadius: '12px',
          color: 'white',
          fontSize: '14px'
        }}>
          <div className="loading-spinner" />
          <p>Loading {effectiveIntern} model from {currentModel.url.slice(0, 40)}...</p>
        </div>
        {modelError && (
          <div className="loading-overlay error" style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255,0,0,0.1)',
            borderRadius: '12px',
            color: '#ff6b6b',
            fontSize: '12px',
            textAlign: 'center',
            padding: '20px'
          }}>
            <p>⚠️ Failed to load 3D model</p>
            <p style={{fontSize: '11px', opacity: 0.7}}>{modelError}</p>
            <p style={{fontSize: '10px', marginTop: '8px'}}>Using emoji fallback instead</p>
          </div>
        )}
      </div>

      {/* Expression Indicator */}
      <div className="expression-indicator">
        <span className="expression-label">Expression:</span>
        <span className="expression-value">{currentExpression}</span>
      </div>
    </div>
  );
}
