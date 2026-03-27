/*
 * Path: /Users/ghost/Desktop/aiterminal/src/renderer/vrm-preloader.ts
 * Module: renderer
 * Purpose: Preload VRM models in background on app startup for instant avatar display
 * Dependencies: three, @pixiv/three-vrm
 * Related: /Users/ghost/Desktop/aiterminal/src/renderer/components/InternAvatar.tsx
 * Keywords: vrm, preload, cache, background-loading, avatar-optimization
 * Last Updated: 2026-03-25
 */

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, VRMExpressionPresetName } from '@pixiv/three-vrm';
import * as THREE from 'three';

export interface PreloadedVRM {
  vrm: any;
  expressionManager: any;
  VRMExpressionPresetName: any;
  scene: THREE.Scene;
  camera: THREE.Camera;
  renderer: THREE.WebGLRenderer;
  controls: any;
  thumbnail?: string;
}

export interface PreloadProgress {
  modelId: string;
  status: 'pending' | 'loading' | 'loaded' | 'error';
  progress: number; // 0-100
  error?: string;
}

type PreloadCallback = (progress: PreloadProgress) => void;

// Global VRM cache
let vrmCache: Record<string, PreloadedVRM | null> = {};
let preloadPromises: Record<string, Promise<void>> = {};

/**
 * Get a preloaded VRM model from cache
 * Returns null if not yet loaded
 */
export function getPreloadedVRM(modelId: string): PreloadedVRM | null {
  const cached = vrmCache[modelId] || null;
  console.log(`[VRMPreloader] getPreloadedVRM(${modelId}) =`, cached ? 'FOUND' : 'NOT FOUND');
  console.log(`[VRMPreloader] Cache keys:`, Object.keys(vrmCache));
  return cached;
}

/**
 * Check if a model is currently loading
 */
export function isPreloading(modelId: string): boolean {
  return modelId in preloadPromises;
}

/**
 * Check if a model has been preloaded
 */
export function isPreloaded(modelId: string): boolean {
  return !!vrmCache[modelId];
}

/**
 * Clear all preloaded VRMs (useful for memory cleanup)
 */
export function clearPreloadedVRMs(): void {
  // Dispose all cached VRMs
  Object.values(vrmCache).forEach(cached => {
    if (cached && cached.renderer) {
      cached.renderer.dispose();
    }
  });
  vrmCache = {};
  preloadPromises = {};
}

/**
 * Preload a single VRM model
 */
async function preloadVRM(
  modelId: string,
  modelUrl: string,
  onProgress?: PreloadCallback
): Promise<void> {
  // Skip if already loaded or loading
  if (vrmCache[modelId]) {
    onProgress?.({ modelId, status: 'loaded', progress: 100 });
    return;
  }

  if (modelId in preloadPromises) {
    return preloadPromises[modelId];
  }

  // Mark as loading
  onProgress?.({ modelId, status: 'loading', progress: 0 });

  preloadPromises[modelId] = (async () => {
    try {
      // Check if document is ready
      if (!document || !document.body) {
        throw new Error('Document not ready');
      }

      // Create offscreen canvas for loading (don't attach to DOM)
      const offscreenCanvas = document.createElement('canvas');
      const offscreenContainer = document.createElement('div');
      offscreenContainer.style.position = 'absolute';
      offscreenContainer.style.top = '-9999px';
      offscreenContainer.style.left = '-9999px';
      document.body.appendChild(offscreenContainer);
      offscreenContainer.appendChild(offscreenCanvas);

      // Setup minimal Three.js scene for loading
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x1a1a2e);

      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
      camera.position.set(0, 1.4, 4);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(64, 64); // Small size for loading
      renderer.setPixelRatio(1);
      offscreenCanvas.width = 64;
      offscreenCanvas.height = 64;
      offscreenContainer.appendChild(renderer.domElement);

      // Create loader
      const loader = new GLTFLoader();
      loader.crossOrigin = 'anonymous';
      loader.register((parser: any) => new VRMLoaderPlugin(parser));

      // Load VRM
      const gltf = await new Promise<any>((resolve, reject) => {
        loader.load(
          modelUrl,
          resolve,
          (progress: any) => {
            const percent = Math.round((progress.loaded / progress.total) * 100);
            onProgress?.({ modelId, status: 'loading', progress: percent });
          },
          reject
        );
      });

      const vrmModel = gltf.userData.vrm;
      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.combineSkeletons(gltf.scene);
      VRMUtils.combineMorphs(vrmModel);

      // Disable frustum culling
      vrmModel.scene.traverse((obj: any) => {
        obj.frustumCulled = false;
      });

      vrmModel.scene.rotation.y = Math.PI;
      scene.add(vrmModel.scene);

      // Cache the loaded VRM
      vrmCache[modelId] = {
        vrm: vrmModel,
        expressionManager: vrmModel.expressionManager,
        VRMExpressionPresetName,
        scene,
        camera,
        renderer,
        controls: null
      };

      console.log(`[VRMPreloader] ✅ Cached ${modelId}:`, {
        hasVRM: !!vrmModel,
        hasScene: !!scene,
        hasCamera: !!camera,
        hasRenderer: !!renderer
      });

      onProgress?.({ modelId, status: 'loaded', progress: 100 });

      // Cleanup DOM
      document.body.removeChild(offscreenContainer);

    } catch (error) {
      console.error(`[VRMPreloader] Failed to preload ${modelId}:`, error);
      onProgress?.({
        modelId,
        status: 'error',
        progress: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  })();

  await preloadPromises[modelId];
}

/**
 * Preload multiple VRM models in parallel
 */
export async function preloadVRMModels(
  models: Array<{ id: string; url: string }>,
  onProgress?: PreloadCallback
): Promise<void> {
  const promises = models.map(model =>
    preloadVRM(model.id, model.url, onProgress)
  );

  await Promise.allSettled(promises);
}

/**
 * Get preload status for all models
 */
export function getPreloadStatus(): Record<string, PreloadProgress> {
  const status: Record<string, PreloadProgress> = {};

  Object.entries(vrmCache).forEach(([id, cached]) => {
    status[id] = {
      modelId: id,
      status: cached ? 'loaded' : 'pending',
      progress: 100
    };
  });

  Object.keys(preloadPromises).forEach(id => {
    if (!status[id]) {
      status[id] = {
        modelId: id,
        status: 'loading',
        progress: 0
      };
    }
  });

  return status;
}
