/*
 * Path: /Users/ghost/Desktop/aiterminal/src/renderer/vrm-models.ts
 * Module: renderer
 * Purpose: VRM model configuration and management for intern avatars
 * Dependencies: none
 * Related: /Users/ghost/Desktop/aiterminal/src/renderer/components/InternAvatar.tsx
 * Keywords: vrm, models, avatar, configuration, tooltips, intern-models
 * Last Updated: 2026-03-25
 */

/**
 * VRM Model configuration for each intern
 *
 * To add custom models:
 * 1. Place .vrm files in a public directory or use a URL
 * 2. Add configuration below with name, url, and metadata
 * 3. The tooltip will display in the avatar settings panel
 */

export interface VRMModelConfig {
  id: string;
  name: string;
  displayName: string;
  url: string;
  thumbnail?: string;
  description: string;
  personality: string;
  specialties: string[];
  color: string;
  emoji: string;
}

export const AVAILABLE_VRM_MODELS: Record<string, VRMModelConfig> = {
  mei: {
    id: 'mei',
    name: 'mei',
    displayName: 'MEI',
    url: './models/AvatarSample_A.vrm',
    thumbnail: '',
    description: 'Dev & Stripe specialist. Full-stack engineer with CI/CD expertise.',
    personality: 'Analytical, efficient, test-driven',
    specialties: ['React', 'TypeScript', 'Stripe', 'CI/CD', 'Testing'],
    color: '#3b82f6',
    emoji: '👩‍💻'
  },
  sora: {
    id: 'sora',
    name: 'sora',
    displayName: 'SORA',
    url: './models/hana.vrm', // Swapped with Hana
    thumbnail: '',
    description: 'Research & analysis expert. Data-driven insights and market research.',
    personality: 'Curious, thorough, detail-oriented',
    specialties: ['Research', 'Data Analysis', 'Documentation', 'Architecture'],
    color: '#10b981',
    emoji: '🔬'
  },
  hana: {
    id: 'hana',
    name: 'hana',
    displayName: 'HANA',
    url: './models/sora.vrm', // Swapped with Sora
    thumbnail: '',
    description: 'Content & marketing specialist. Compelling copy and multi-platform content.',
    personality: 'Creative, persuasive, energetic',
    specialties: ['Copywriting', 'Social Media', 'Marketing', 'Content Strategy'],
    color: '#f97316',
    emoji: '✨'
  },
  // Alternative models (commented out - add your own URLs)
  // custom: {
  //   id: 'custom',
  //   name: 'custom',
  //   displayName: 'CUSTOM',
  //   url: './models/custom-avatar.vrm', // Local file in public/models/
  //   thumbnail: './models/custom-avatar.png',
  //   description: 'Your custom avatar model',
  //   personality: 'Custom personality',
  //   specialties: ['Custom', 'Specialties'],
  //   color: '#8b5cf6',
  //   emoji: '🎨'
  // }
};

/**
 * Get default model (fallback when no intern specified)
 */
export function getDefaultModel(): VRMModelConfig {
  return AVAILABLE_VRM_MODELS.sora;
}

/**
 * Get model by intern name
 */
export function getModelForIntern(intern: string | null): VRMModelConfig {
  if (!intern || !AVAILABLE_VRM_MODELS[intern]) {
    return getDefaultModel();
  }
  return AVAILABLE_VRM_MODELS[intern];
}

/**
 * Get all available models as array
 */
export function getAllModels(): VRMModelConfig[] {
  return Object.values(AVAILABLE_VRM_MODELS);
}

/**
 * Model categories for organization
 */
export const MODEL_CATEGORIES = {
  development: ['mei'],
  research: ['sora'],
  creative: ['hana']
} as const;

/**
 * Tooltip content generator for model info
 */
export function getModelTooltip(model: VRMModelConfig): string {
  return `
${model.emoji} ${model.displayName}

${model.description}

Personality: ${model.personality}

Specialties:
${model.specialties.map(s => `  • ${s}`).join('\n')}
  `.trim();
}
