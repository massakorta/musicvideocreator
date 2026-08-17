export type ImageQualityId = 'low-fast' | 'good' | 'high' | 'highest';

export interface ImageQualityPreset {
  id: ImageQualityId;
  name: string;
  description: string;
  /** Hidden from UI — OpenAI model id */
  model: string;
  /** Hidden from UI — OpenAI quality param */
  quality: 'low' | 'medium' | 'high';
  /** Expected seconds per still for wait cards and pipeline ETAs */
  expectedSecondsPerStill: number;
  accent: string;
  secondary: string;
}

export const IMAGE_QUALITY_PRESETS: ImageQualityPreset[] = [
  {
    id: 'low-fast',
    name: 'Low but Fast',
    description: 'Draft stills. Cheapest and quickest — great for exploring ideas.',
    model: 'gpt-image-1-mini',
    quality: 'low',
    expectedSecondsPerStill: 8,
    accent: '#7BA17D',
    secondary: '#4A7C8A',
  },
  {
    id: 'good',
    name: 'Good quality',
    description: 'Clearer stills with more detail, still reasonably quick.',
    model: 'gpt-image-1',
    quality: 'high',
    expectedSecondsPerStill: 18,
    accent: '#C9A36A',
    secondary: '#6B8E9E',
  },
  {
    id: 'high',
    name: 'High quality',
    description: 'Sharper, more faithful stills for polished scenes.',
    model: 'gpt-image-1.5',
    quality: 'high',
    expectedSecondsPerStill: 22,
    accent: '#E8B86D',
    secondary: '#8B6F47',
  },
  {
    id: 'highest',
    name: 'Highest quality',
    description: 'Best detail and prompt following — slowest and most expensive.',
    model: 'gpt-image-2',
    quality: 'high',
    expectedSecondsPerStill: 35,
    accent: '#D4A574',
    secondary: '#5C4A6E',
  },
];

export const DEFAULT_IMAGE_QUALITY_ID: ImageQualityId = 'low-fast';

export function getImageQuality(id: string | undefined): ImageQualityPreset {
  return IMAGE_QUALITY_PRESETS.find((preset) => preset.id === id) ?? IMAGE_QUALITY_PRESETS[0]!;
}

export function resolveProjectImageQualityId(project: { imageQualityId?: ImageQualityId }): ImageQualityId {
  return project.imageQualityId ?? DEFAULT_IMAGE_QUALITY_ID;
}

export function effectiveGeneratedImageQualityId(project: {
  generatedImageQualityId?: ImageQualityId;
}): ImageQualityId {
  return project.generatedImageQualityId ?? DEFAULT_IMAGE_QUALITY_ID;
}

export function imagesNeedQualityRegenerate(project: {
  imageQualityId?: ImageQualityId;
  generatedImageQualityId?: ImageQualityId;
  scenes: Array<{ currentAssetId?: string; image?: unknown }>;
}): boolean {
  const hasImages = project.scenes.some((scene) => Boolean(scene.currentAssetId || scene.image));
  if (!hasImages) return false;
  return (
    resolveProjectImageQualityId(project) !== effectiveGeneratedImageQualityId(project)
  );
}
