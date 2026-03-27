/*
 * Path: /Users/ghost/Desktop/aiterminal/src/renderer/components/VRMSettings.tsx
 * Module: renderer/components
 * Purpose: Settings UI panel for VRM avatar customization
 * Dependencies: react
 * Related: /Users/ghost/Desktop/aiterminal/src/renderer/components/InternAvatar.tsx
 * Keywords: vrm, settings, customization, glass-morphism, ui-panel
 * Last Updated: 2026-03-25
 */

import { useEffect, useState, useCallback } from 'react';

/**
 * VRM customization settings interface
 */
export interface VRMSettings {
  expressionTransitionSpeed: number;
  emotionIntensity: number;
  lipSyncSensitivity: number;
  blinkFrequency: number;
  idleAnimationSpeed: number;
  gestureAnimationSpeed: number;
  cursorTrackingSensitivity: number;
  debugMode: boolean;
}

/**
 * Default VRM settings
 */
const DEFAULT_VRM_SETTINGS: VRMSettings = {
  expressionTransitionSpeed: 1.0,
  emotionIntensity: 1.0,
  lipSyncSensitivity: 1.0,
  blinkFrequency: 3.0,
  idleAnimationSpeed: 1.0,
  gestureAnimationSpeed: 1.0,
  cursorTrackingSensitivity: 1.0,
  debugMode: false,
};

/**
 * Local storage key for VRM settings
 */
const VRM_SETTINGS_STORAGE_KEY = 'vrm-settings';

/**
 * Load VRM settings from localStorage
 */
function loadVRMSettings(): VRMSettings {
  try {
    const stored = localStorage.getItem(VRM_SETTINGS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Merge with defaults to handle missing keys
      return { ...DEFAULT_VRM_SETTINGS, ...parsed };
    }
  } catch (error) {
    console.warn('[VRMSettings] Failed to load settings from localStorage:', error);
  }
  return DEFAULT_VRM_SETTINGS;
}

/**
 * Save VRM settings to localStorage
 */
function saveVRMSettings(settings: VRMSettings): void {
  try {
    localStorage.setItem(VRM_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('[VRMSettings] Failed to save settings to localStorage:', error);
  }
}

/**
 * Props for VRMSettings component
 */
interface VRMSettingsProps {
  isVisible: boolean;
  onClose: () => void;
  onSettingsChange?: (settings: VRMSettings) => void;
}

/**
 * VRM Settings Panel Component
 *
 * Glass-morphism settings panel for customizing VRM avatar behavior.
 * Features collapsible sections, sliders, toggles, and localStorage persistence.
 *
 * @example
 * ```tsx
 * <VRMSettings
 *   isVisible={showSettings}
 *   onClose={() => setShowSettings(false)}
 *   onSettingsChange={(settings) => console.log('Settings updated:', settings)}
 * />
 * ```
 */
export function VRMSettings({ isVisible, onClose, onSettingsChange }: VRMSettingsProps) {
  const [settings, setSettings] = useState<VRMSettings>(DEFAULT_VRM_SETTINGS);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [isResetting, setIsResetting] = useState(false);

  // Load settings on mount
  useEffect(() => {
    const loaded = loadVRMSettings();
    setSettings(loaded);
  }, []);

  // Debounced save to avoid excessive localStorage writes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      saveVRMSettings(settings);
      onSettingsChange?.(settings);
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [settings, onSettingsChange]);

  // Update a single setting value
  const updateSetting = useCallback(<K extends keyof VRMSettings>(
    key: K,
    value: VRMSettings[K]
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  // Toggle section collapse state
  const toggleSection = useCallback((section: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  }, []);

  // Reset to defaults
  const resetToDefaults = useCallback(() => {
    setIsResetting(true);
    setSettings(DEFAULT_VRM_SETTINGS);
    setTimeout(() => setIsResetting(false), 300);
  }, []);

  // Don't render if not visible
  if (!isVisible) {
    return null;
  }

  const isCollapsed = (section: string) => collapsedSections[section];

  return (
    <div className="vrm-settings-panel">
      {/* Header */}
      <div className="vrm-settings-header">
        <div className="vrm-settings-title">
          <span className="vrm-settings-icon">⚙️</span>
          <h2>VRM Avatar Settings</h2>
        </div>
        <div className="vrm-settings-controls">
          <button
            className="vrm-settings-btn vrm-settings-btn--secondary"
            onClick={resetToDefaults}
            disabled={isResetting}
            title="Reset to defaults"
          >
            ↺ Reset
          </button>
          <button
            className="vrm-settings-btn vrm-settings-btn--close"
            onClick={onClose}
            title="Close settings (Cmd+Shift+V)"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Settings Content */}
      <div className="vrm-settings-content">
        {/* Expression Settings */}
        <div className="vrm-settings-section">
          <button
            className="vrm-settings-section-header"
            onClick={() => toggleSection('expression')}
          >
            <span className="vrm-settings-section-title">Expression Settings</span>
            <span className={`vrm-settings-chevron ${isCollapsed('expression') ? 'collapsed' : ''}`}>
              ▼
            </span>
          </button>

          {!isCollapsed('expression') && (
            <div className="vrm-settings-section-body">
              {/* Expression Transition Speed */}
              <div className="vrm-setting-row">
                <div className="vrm-setting-info">
                  <label className="vrm-setting-label">Expression Transition Speed</label>
                  <span className="vrm-setting-value">{settings.expressionTransitionSpeed.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="2.0"
                  step="0.1"
                  value={settings.expressionTransitionSpeed}
                  onChange={(e) => updateSetting('expressionTransitionSpeed', parseFloat(e.target.value))}
                  className="vrm-setting-slider"
                  title="How fast expressions transition (0.1 = slow, 2.0 = fast)"
                />
              </div>

              {/* Emotion Intensity */}
              <div className="vrm-setting-row">
                <div className="vrm-setting-info">
                  <label className="vrm-setting-label">Emotion Intensity</label>
                  <span className="vrm-setting-value">{Math.round(settings.emotionIntensity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.1"
                  value={settings.emotionIntensity}
                  onChange={(e) => updateSetting('emotionIntensity', parseFloat(e.target.value))}
                  className="vrm-setting-slider"
                  title="Strength of facial expressions (0.0 = subtle, 1.0 = full)"
                />
              </div>

              {/* Lip-sync Sensitivity */}
              <div className="vrm-setting-row">
                <div className="vrm-setting-info">
                  <label className="vrm-setting-label">Lip-sync Sensitivity</label>
                  <span className="vrm-setting-value">{settings.lipSyncSensitivity.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="2.0"
                  step="0.1"
                  value={settings.lipSyncSensitivity}
                  onChange={(e) => updateSetting('lipSyncSensitivity', parseFloat(e.target.value))}
                  className="vrm-setting-slider"
                  title="Mouth animation sensitivity during TTS playback (0.1 = minimal, 2.0 = exaggerated)"
                />
              </div>
            </div>
          )}
        </div>

        {/* Animation Settings */}
        <div className="vrm-settings-section">
          <button
            className="vrm-settings-section-header"
            onClick={() => toggleSection('animation')}
          >
            <span className="vrm-settings-section-title">Animation Settings</span>
            <span className={`vrm-settings-chevron ${isCollapsed('animation') ? 'collapsed' : ''}`}>
              ▼
            </span>
          </button>

          {!isCollapsed('animation') && (
            <div className="vrm-settings-section-body">
              {/* Blink Frequency */}
              <div className="vrm-setting-row">
                <div className="vrm-setting-info">
                  <label className="vrm-setting-label">Blink Frequency</label>
                  <span className="vrm-setting-value">{settings.blinkFrequency.toFixed(1)}s</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="5.0"
                  step="0.5"
                  value={settings.blinkFrequency}
                  onChange={(e) => updateSetting('blinkFrequency', parseFloat(e.target.value))}
                  className="vrm-setting-slider"
                  title="Time between automatic blinks in seconds (0.5 = frequent, 5.0 = rare)"
                />
              </div>

              {/* Idle Animation Speed */}
              <div className="vrm-setting-row">
                <div className="vrm-setting-info">
                  <label className="vrm-setting-label">Idle Animation Speed</label>
                  <span className="vrm-setting-value">{settings.idleAnimationSpeed.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={settings.idleAnimationSpeed}
                  onChange={(e) => updateSetting('idleAnimationSpeed', parseFloat(e.target.value))}
                  className="vrm-setting-slider"
                  title="Speed of idle animations (breathing, sway) (0.5 = slow, 2.0 = fast)"
                />
              </div>

              {/* Gesture Animation Speed */}
              <div className="vrm-setting-row">
                <div className="vrm-setting-info">
                  <label className="vrm-setting-label">Gesture Animation Speed</label>
                  <span className="vrm-setting-value">{settings.gestureAnimationSpeed.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={settings.gestureAnimationSpeed}
                  onChange={(e) => updateSetting('gestureAnimationSpeed', parseFloat(e.target.value))}
                  className="vrm-setting-slider"
                  title="Speed of gesture animations (wave, nod, etc.) (0.5 = slow, 2.0 = fast)"
                />
              </div>
            </div>
          )}
        </div>

        {/* Advanced Settings */}
        <div className="vrm-settings-section">
          <button
            className="vrm-settings-section-header"
            onClick={() => toggleSection('advanced')}
          >
            <span className="vrm-settings-section-title">Advanced Settings</span>
            <span className={`vrm-settings-chevron ${isCollapsed('advanced') ? 'collapsed' : ''}`}>
              ▼
            </span>
          </button>

          {!isCollapsed('advanced') && (
            <div className="vrm-settings-section-body">
              {/* Cursor Tracking Sensitivity */}
              <div className="vrm-setting-row">
                <div className="vrm-setting-info">
                  <label className="vrm-setting-label">Cursor Tracking Sensitivity</label>
                  <span className="vrm-setting-value">
                    {settings.cursorTrackingSensitivity === 0 ? 'Off' : `${settings.cursorTrackingSensitivity.toFixed(1)}x`}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="2.0"
                  step="0.1"
                  value={settings.cursorTrackingSensitivity}
                  onChange={(e) => updateSetting('cursorTrackingSensitivity', parseFloat(e.target.value))}
                  className="vrm-setting-slider"
                  title="Head follows mouse cursor (0.0 = disabled, 2.0 = very responsive)"
                />
              </div>

              {/* Debug Mode Toggle */}
              <div className="vrm-setting-row vrm-setting-row--toggle">
                <div className="vrm-setting-info">
                  <label className="vrm-setting-label">Debug Mode</label>
                  <span className="vrm-setting-description">Show expression names in console</span>
                </div>
                <button
                  className={`vrm-toggle ${settings.debugMode ? 'vrm-toggle--active' : ''}`}
                  onClick={() => updateSetting('debugMode', !settings.debugMode)}
                  aria-label="Toggle debug mode"
                >
                  <span className="vrm-toggle-slider" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Keyboard Shortcut Hint */}
        <div className="vrm-settings-footer">
          <p className="vrm-settings-hint">
            💡 Press <kbd>Cmd+Shift+V</kbd> to toggle these settings
          </p>
        </div>
      </div>
    </div>
  );
}
