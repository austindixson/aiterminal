/*
 * Path: /Users/ghost/Desktop/aiterminal/src/renderer/components/VRMModelSelector.tsx
 * Module: renderer/components
 * Purpose: VRM model management UI with tooltips for easy avatar switching
 * Dependencies: react
 * Related: /Users/ghost/Desktop/aiterminal/src/renderer/components/InternAvatar.tsx
 * Keywords: vrm, model-selector, tooltips, avatar-management, settings-ui
 * Last Updated: 2026-03-25
 */

import { useState } from 'react';
import { getAllModels, getModelForIntern, type VRMModelConfig } from '../vrm-models';

interface VRMModelSelectorProps {
  selectedIntern: string | null;
  onSelectIntern: (intern: string) => void;
  onClose: () => void;
}

export function VRMModelSelector({ selectedIntern, onSelectIntern, onClose }: VRMModelSelectorProps) {
  const [hoveredModel, setHoveredModel] = useState<VRMModelConfig | null>(null);
  const models = getAllModels();

  const currentModel = getModelForIntern(selectedIntern);

  return (
    <div className="vrm-model-selector-overlay" onClick={onClose}>
      <div className="vrm-model-selector" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="vrm-model-selector__header">
          <h2>🎭 Agent Avatar Models</h2>
          <button className="vrm-model-selector__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {/* Current Selection */}
        <div className="vrm-model-selector__current">
          <span className="label">Currently Active:</span>
          <div className="current-model" style={{ borderColor: currentModel.color }}>
            <span className="model-emoji">{currentModel.emoji}</span>
            <span className="model-name">{currentModel.displayName}</span>
            <span className="model-specialties">{currentModel.specialties.slice(0, 2).join(' • ')}</span>
          </div>
        </div>

        {/* Model Grid */}
        <div className="vrm-model-selector__grid">
          {models.map((model) => {
            const isSelected = model.id === (selectedIntern || 'sora');
            return (
              <div
                key={model.id}
                className={`model-card ${isSelected ? 'model-card--selected' : ''}`}
                onClick={() => onSelectIntern(model.id)}
                onMouseEnter={() => setHoveredModel(model)}
                onMouseLeave={() => setHoveredModel(null)}
                style={{
                  borderColor: isSelected ? model.color : 'transparent',
                  boxShadow: isSelected ? `0 0 20px ${model.color}40` : undefined
                }}
              >
                {/* Model Icon/Emoji */}
                <div className="model-card__icon" style={{ backgroundColor: `${model.color}20` }}>
                  <span className="model-emoji">{model.emoji}</span>
                </div>

                {/* Model Info */}
                <div className="model-card__info">
                  <h3>{model.displayName}</h3>
                  <p className="model-description">{model.description}</p>
                  <div className="model-tags">
                    {model.specialties.slice(0, 3).map((spec) => (
                      <span key={spec} className="tag" style={{ backgroundColor: `${model.color}30` }}>
                        {spec}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Selection Indicator */}
                {isSelected && (
                  <div className="model-card__selected" style={{ backgroundColor: model.color }}>
                    ✓
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Tooltip Panel */}
        {hoveredModel && (
          <div
            className="vrm-model-selector__tooltip"
            style={{
              borderColor: hoveredModel.color,
              backgroundColor: `${hoveredModel.color}10`
            }}
          >
            <div className="tooltip-header" style={{ borderBottomColor: hoveredModel.color }}>
              <span className="tooltip-emoji">{hoveredModel.emoji}</span>
              <h3>{hoveredModel.displayName}</h3>
            </div>
            <div className="tooltip-content">
              <p className="tooltip-description">{hoveredModel.description}</p>
              <div className="tooltip-section">
                <strong>Personality:</strong>
                <p>{hoveredModel.personality}</p>
              </div>
              <div className="tooltip-section">
                <strong>Specialties:</strong>
                <div className="tooltip-specialties">
                  {hoveredModel.specialties.map((spec) => (
                    <span key={spec} className="spec-tag" style={{ backgroundColor: `${hoveredModel.color}30` }}>
                      {spec}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer with hint */}
        <div className="vrm-model-selector__footer">
          <p>💡 Click any model to switch • Hover for details • Add custom models in <code>src/renderer/vrm-models.ts</code></p>
        </div>
      </div>

      <style>{`
        .vrm-model-selector-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          animation: fadeIn 0.2s ease-out;
        }

        .vrm-model-selector {
          background: #1a1a2e;
          border-radius: 20px;
          padding: 30px;
          max-width: 900px;
          max-height: 80vh;
          overflow-y: auto;
          position: relative;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .vrm-model-selector__header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .vrm-model-selector__header h2 {
          color: #fff;
          margin: 0;
          font-size: 24px;
        }

        .vrm-model-selector__close {
          background: none;
          border: none;
          color: #888;
          font-size: 32px;
          cursor: pointer;
          padding: 0;
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          transition: all 0.2s;
        }

        .vrm-model-selector__close:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }

        .vrm-model-selector__current {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 24px;
        }

        .vrm-model-selector__current .label {
          color: #888;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .current-model {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 8px;
          padding: 12px;
          border: 2px solid transparent;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.03);
        }

        .model-emoji {
          font-size: 32px;
        }

        .model-name {
          font-weight: bold;
          color: #fff;
          font-size: 16px;
        }

        .model-specialties {
          color: #888;
          font-size: 12px;
          margin-left: auto;
        }

        .vrm-model-selector__grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }

        .model-card {
          background: rgba(255, 255, 255, 0.03);
          border: 2px solid transparent;
          border-radius: 12px;
          padding: 16px;
          cursor: pointer;
          transition: all 0.2s;
          position: relative;
          overflow: hidden;
        }

        .model-card:hover {
          background: rgba(255, 255, 255, 0.05);
          transform: translateY(-2px);
        }

        .model-card--selected {
          background: rgba(255, 255, 255, 0.08);
        }

        .model-card__icon {
          width: 60px;
          height: 60px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 12px;
        }

        .model-card__icon .model-emoji {
          font-size: 28px;
        }

        .model-card__info h3 {
          color: #fff;
          margin: 0 0 8px 0;
          font-size: 18px;
        }

        .model-description {
          color: #aaa;
          font-size: 13px;
          line-height: 1.4;
          margin: 0 0 12px 0;
        }

        .model-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .tag {
          font-size: 11px;
          padding: 4px 8px;
          border-radius: 4px;
          color: #fff;
        }

        .model-card__selected {
          position: absolute;
          top: 12px;
          right: 12px;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-size: 14px;
          font-weight: bold;
        }

        .vrm-model-selector__tooltip {
          position: absolute;
          bottom: 80px;
          right: 30px;
          width: 300px;
          background: rgba(26, 26, 46, 0.95);
          border: 2px solid;
          border-radius: 12px;
          padding: 16px;
          backdrop-filter: blur(10px);
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
          animation: slideIn 0.2s ease-out;
          z-index: 10001;
        }

        .tooltip-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding-bottom: 12px;
          border-bottom: 1px solid;
          margin-bottom: 12px;
        }

        .tooltip-emoji {
          font-size: 24px;
        }

        .tooltip-header h3 {
          color: #fff;
          margin: 0;
          font-size: 18px;
        }

        .tooltip-content {
          color: #ccc;
        }

        .tooltip-description {
          margin: 0 0 12px 0;
          line-height: 1.5;
        }

        .tooltip-section {
          margin-bottom: 12px;
        }

        .tooltip-section strong {
          color: #fff;
          display: block;
          margin-bottom: 4px;
          font-size: 12px;
        }

        .tooltip-section p {
          margin: 0;
          font-size: 13px;
          color: #aaa;
        }

        .tooltip-specialties {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .spec-tag {
          font-size: 11px;
          padding: 4px 8px;
          border-radius: 4px;
          color: #fff;
        }

        .vrm-model-selector__footer {
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          padding-top: 16px;
          text-align: center;
        }

        .vrm-model-selector__footer p {
          color: #666;
          font-size: 12px;
          margin: 0;
        }

        .vrm-model-selector__footer code {
          background: rgba(255, 255, 255, 0.1);
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 11px;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
