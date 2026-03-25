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

// VRM model URLs for each intern (using public sample models for now)
const INTERN_VRM_MODELS: Record<string, string> = {
  mei: 'https://raw.githubusercontent.com/nagatsuki/VirtualMotionPuppet/master/AliciaSolid.vrm',
  sora: 'https://pixiv.github.io/three-vrm/examples/models/three-vrm-girl.vrm',
  hana: 'https://raw.githubusercontent.com/pixiv/three-vrm/master/examples/models/three-vrm-girl.vrm'
};

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
}

export function InternAvatar({ intern, isRunning, events }: InternAvatarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const vrmRef = useRef<any>(null);
  const [currentExpression, setCurrentExpression] = useState<VRMExpression>('neutral');
  const [modelLoaded, setModelLoaded] = useState(false);

  // Initialize Three.js scene and load VRM
  useEffect(() => {
    if (!containerRef.current || !intern) return;

    let cleanup: (() => void) | null = null;

    const initVRM = async () => {
      const container = containerRef.current;
      if (!container) return;

      // Clear previous content
      container.innerHTML = '';

      // Dynamic import of Three.js (only when needed to reduce bundle size)
      const THREE_module = await import('three');
      const THREE = THREE_module as any; // Three.js doesn't have perfect types yet
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
      const { VRMLoaderPlugin, VRMUtils, VRMExpressionPresetName } = await import('@pixiv/three-vrm');

      // Scene setup
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x1a1a2e); // Dark blue background

      const camera = new THREE.PerspectiveCamera(
        30,
        container.clientWidth / container.clientHeight,
        0.1,
        20
      );
      camera.position.set(0, 1.4, 4);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      container.appendChild(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 1.4, 0);
      controls.enableZoom = false;
      controls.enablePan = false;
      controls.update();

      // Lighting
      const light = new THREE.DirectionalLight(0xffffff, 1.5);
      light.position.set(2, 3, 5);
      scene.add(light);

      const ambientLight = new THREE.AmbientLight(0x888888, 0.8);
      scene.add(ambientLight);

      const backLight = new THREE.DirectionalLight(0x6688cc, 0.5);
      backLight.position.set(-2, 2, -5);
      scene.add(backLight);

      // Load VRM model
      const loader = new GLTFLoader();
      loader.register((parser: any) => new VRMLoaderPlugin(parser));

      const vrmUrl = INTERN_VRM_MODELS[intern] || INTERN_VRM_MODELS.mei;

      try {
        const gltf = await new Promise<any>((resolve, reject) => {
          loader.load(
            vrmUrl,
            resolve,
            (progress: any) => {
              const percent = Math.round((progress.loaded / progress.total) * 100);
              console.log(`[InternAvatar] Loading VRM for ${intern}... ${percent}%`);
            },
            reject
          );
        });

        const vrmModel = gltf.userData.vrm;
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.combineSkeletons(gltf.scene);
        VRMUtils.combineMorphs(vrmModel);

        vrmModel.scene.rotation.y = Math.PI; // Face forward
        scene.add(vrmModel.scene);

        vrmRef.current = {
          vrm: vrmModel,
          expressionManager: vrmModel.expressionManager,
          VRMExpressionPresetName,
          scene,
          camera,
          renderer,
          controls
        };

        setModelLoaded(true);
        console.log(`%c✅ ${intern.toUpperCase()} VRM loaded!`, 'color:#ff66aa;font-weight:bold');

        // Set initial expression
        vrmModel.expressionManager.setValue(VRMExpressionPresetName.Neutral, 1);

        // Animation loop
        const clock = new THREE.Clock();
        let idleTimer = 0;
        let idleIndex = 0;

        const animate = () => {
          requestAnimationFrame(animate);
          const delta = clock.getDelta();

          if (vrmModel) {
            vrmModel.update(delta);

            // Idle breathing animation
            if (vrmModel.humanoid) {
              const breath = Math.sin(clock.elapsedTime * 2) * 0.03;
              vrmModel.humanoid.getNormalizedBoneNode('chest')!.rotation.x = breath;
            }

            // Idle expression cycling
            idleTimer += delta * 1000;
            if (idleTimer > IDLE_INTERVAL && !isRunning) {
              idleTimer = 0;
              idleIndex = (idleIndex + 1) % IDLE_EXPRESSIONS.length;
              const idleExpr = IDLE_EXPRESSIONS[idleIndex];
              // Apply idle expression subtly
              Object.values(VRMExpressionPresetName).forEach((preset: any) => {
                vrmModel.expressionManager.setValue(preset, 0);
              });
              if (idleExpr === 'blink') {
                vrmModel.expressionManager.setValue(VRMExpressionPresetName.Blink, 0.5);
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

        cleanup = () => {
          window.removeEventListener('resize', handleResize);
          renderer.dispose();
          container.innerHTML = '';
        };

      } catch (error) {
        console.error(`[InternAvatar] Failed to load VRM for ${intern}:`, error);
        setModelLoaded(false);
      }
    };

    initVRM();

    return () => {
      if (cleanup) cleanup();
      if (vrmRef.current?.renderer) {
        vrmRef.current.renderer.dispose();
      }
    };
  }, [intern]);

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
      if (vrmRef.current && !isRunning) {
        Object.values(VRMExpressionPresetName).forEach((preset: any) => {
          vrmRef.current.expressionManager.setValue(preset, 0);
        });
        vrmRef.current.expressionManager.setValue(VRMExpressionPresetName.Neutral, 1);
        setCurrentExpression('neutral');
      }
    }, 3000);

    return () => clearTimeout(timer);

  }, [events, isRunning]);

  if (!intern) {
    return (
      <div className="intern-avatar offline">
        <div className="avatar-placeholder">
          <div className="avatar-icon">💭</div>
          <p className="avatar-text">No intern active</p>
        </div>
      </div>
    );
  }

  return (
    <div className="intern-avatar">
      <div className="avatar-header">
        <span className="intern-name">{intern.toUpperCase()}</span>
        <span className={`status-indicator ${isRunning ? 'running' : 'idle'}`}>
          {isRunning ? '● Working' : '○ Idle'}
        </span>
      </div>
      <div
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
        {!modelLoaded && (
          <div className="loading-overlay">
            <div className="loading-spinner" />
            <p>Loading {intern} model...</p>
          </div>
        )}
      </div>
      <div className="expression-indicator">
        <span className="expression-label">Expression:</span>
        <span className="expression-value">{currentExpression}</span>
      </div>
    </div>
  );
}
