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
import { VRMModelSelector } from './VRMModelSelector';
import { getPreloadedVRM } from '../vrm-preloader';

// Expression presets from VRM
type VRMExpression = 'neutral' | 'happy' | 'angry' | 'sad' | 'surprised' | 'joy' | 'sorrow' | 'fun' | 'aa' | 'ih' | 'ou' | 'ee' | 'oh' | 'blink';

// Map agent events to expressions
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

// Idle animations when intern is waiting
const IDLE_EXPRESSIONS: VRMExpression[] = ['neutral', 'blink', 'neutral', 'blink'];
const IDLE_INTERVAL = 3000; // Switch idle expression every 3 seconds

interface InternAvatarProps {
  intern: string | null;
  isRunning: boolean;
  events: AgentEvent[];
  onInternSelect?: (intern: string) => void;
  showModelSelector?: boolean;
  // Chat interaction state for expression updates
  isStreaming?: boolean;
  hasInput?: boolean;
}

export function InternAvatar({ intern, isRunning, events, onInternSelect, showModelSelector = false, isStreaming = false, hasInput = false }: InternAvatarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const vrmRef = useRef<any>(null);
  const vrmInitializedRef = useRef(false); // Track if VRM is initialized to prevent re-renders
  const [currentExpression, setCurrentExpression] = useState<VRMExpression>('neutral');
  const [modelLoaded, setModelLoaded] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [showSelector, setShowSelector] = useState(false);
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });

  // Use default model if no intern specified
  const currentModel = getModelForIntern(intern);
  const effectiveIntern = intern || 'mei';

  console.log(`[InternAvatar] Rendering intern=${effectiveIntern}, isRunning=${isRunning}, vrmInitialized=${vrmInitializedRef.current}`);

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

        // Add VRM model to scene
        // Tilt forward 10 degrees for conversational pose
        vrmModel.scene.rotation.y = Math.PI; // Face forward
        vrmModel.scene.rotation.x = -0.17; // Tilt forward ~10° (conversational pose)
        vrmModel.scene.position.y = 0.25; // Slightly raised for better face framing
        scene.add(vrmModel.scene);

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
                // Get window dimensions for full-screen cursor tracking
                const windowCenterX = window.innerWidth / 2;
                const windowCenterY = window.innerHeight / 2;

                // Calculate cursor position relative to center of entire window
                const deltaX = cursorPosition.x - windowCenterX;
                const deltaY = cursorPosition.y - windowCenterY;

                // Calculate head rotation to look at cursor
                // NOTE: Avatar scene is rotated 180° on Y, so directions are flipped!
                const maxYaw = 0.6; // ~35 degrees left/right
                const maxPitch = 0.25; // ~15 degrees up/down

                // Calculate normalized direction (-1 to 1) based on window position
                const normalizedX = Math.max(-1, Math.min(1, deltaX / (window.innerWidth / 2)));
                const normalizedY = Math.max(-1, Math.min(1, deltaY / (window.innerHeight / 2)));

                // Flip X direction due to 180° scene rotation
                const targetYaw = -normalizedX * maxYaw;
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
          camera.aspect = container.clientWidth / container.clientHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(container.clientWidth, container.clientHeight);
        };
        window.addEventListener('resize', handleResize);

        // Track cursor position for head-following (works from anywhere in the app)
        const handleMouseMove = (e: MouseEvent) => {
          // Use client coordinates directly (relative to viewport)
          setCursorPosition({ x: e.clientX, y: e.clientY });
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
        if (!modelLoaded) {
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
        vrmModel.scene.position.y = 0.25; // Slightly raised for better face framing
        scene.add(vrmModel.scene);

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
                // Get window dimensions for full-screen cursor tracking
                const windowCenterX = window.innerWidth / 2;
                const windowCenterY = window.innerHeight / 2;

                // Calculate cursor position relative to center of entire window
                const deltaX = cursorPosition.x - windowCenterX;
                const deltaY = cursorPosition.y - windowCenterY;

                // Calculate head rotation to look at cursor
                // NOTE: Avatar scene is rotated 180° on Y, so directions are flipped!
                const maxYaw = 0.6; // ~35 degrees left/right
                const maxPitch = 0.25; // ~15 degrees up/down

                // Calculate normalized direction (-1 to 1) based on window position
                const normalizedX = Math.max(-1, Math.min(1, deltaX / (window.innerWidth / 2)));
                const normalizedY = Math.max(-1, Math.min(1, deltaY / (window.innerHeight / 2)));

                // Flip X direction due to 180° scene rotation
                const targetYaw = -normalizedX * maxYaw;
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
          camera.aspect = container.clientWidth / container.clientHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(container.clientWidth, container.clientHeight);
        };
        window.addEventListener('resize', handleResize);

        // Track cursor position for head-following (works from anywhere in the app)
        const handleMouseMove = (e: MouseEvent) => {
          // Use client coordinates directly (relative to viewport)
          setCursorPosition({ x: e.clientX, y: e.clientY });
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

  // Update expression based on chat interactions (typing, streaming)
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
      {/* Header with model info and settings button */}
      <div
        className="avatar-header"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <div className="avatar-info">
          <span className="intern-emoji">{currentModel.emoji}</span>
          <span className="intern-name" style={{ color: currentModel.color }}>
            {currentModel.displayName}
          </span>
        </div>
        <div className="avatar-controls">
          <span className={`status-indicator ${isRunning ? 'running' : 'idle'}`}>
            {isRunning ? '● Working' : '○ Idle'}
          </span>
          {showModelSelector && (
            <button
              className="avatar-settings-btn"
              onClick={() => setShowSelector(true)}
              title="Change Avatar Model"
              aria-label="Change Avatar Model"
            >
              ⚙️
            </button>
          )}
        </div>
      </div>

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
        style={{
          width: '100%',
          height: '300px',
          position: 'relative',
          borderRadius: '12px',
          overflow: 'hidden'
        }}
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

      {/* Model Selector Modal */}
      {showSelector && (
        <VRMModelSelector
          selectedIntern={intern}
          onSelectIntern={(newIntern) => {
            if (onInternSelect) {
              onInternSelect(newIntern);
            }
            setShowSelector(false);
          }}
          onClose={() => setShowSelector(false)}
        />
      )}
    </div>
  );
}
