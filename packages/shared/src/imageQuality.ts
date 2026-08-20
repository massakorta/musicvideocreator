export type ImageQualityId = 'low-fast' | 'good' | 'high' | 'highest';

export type FalImageSize =
  | 'landscape_16_9'
  | 'landscape_4_3'
  | 'portrait_16_9'
  | 'portrait_4_3'
  | 'square_hd'
  | 'square'
  | { width: number; height: number };

export interface FalImageOptions {
  image_size?: FalImageSize;
  num_inference_steps?: number;
  acceleration?: 'none' | 'regular' | 'high';
}

export interface ImageQualityPreset {
  id: ImageQualityId;
  name: string;
  description: string;
  /** fal.ai model endpoint id */
  falEndpoint: string;
  falOptions: FalImageOptions;
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
    falEndpoint: 'fal-ai/flux/schnell',
    falOptions: {
      image_size: 'landscape_16_9',
      num_inference_steps: 4,
      acceleration: 'high',
    },
    expectedSecondsPerStill: 2,
    accent: '#7BA17D',
    secondary: '#4A7C8A',
  },
  {
    id: 'good',
    name: 'Good quality',
    description: 'Clearer stills with more detail, still reasonably quick.',
    falEndpoint: 'fal-ai/flux/dev',
    falOptions: {
      image_size: 'landscape_16_9',
      num_inference_steps: 28,
    },
    expectedSecondsPerStill: 5,
    accent: '#C9A36A',
    secondary: '#6B8E9E',
  },
  {
    id: 'high',
    name: 'High quality',
    description: 'Sharper, more faithful stills for polished scenes.',
    falEndpoint: 'fal-ai/flux-2',
    falOptions: {
      image_size: { width: 1536, height: 1024 },
    },
    expectedSecondsPerStill: 8,
    accent: '#E8B86D',
    secondary: '#8B6F47',
  },
  {
    id: 'highest',
    name: 'Highest quality',
    description: 'Best detail and prompt following — slowest and most expensive.',
    falEndpoint: 'fal-ai/flux-2-pro',
    falOptions: {
      image_size: { width: 1536, height: 1024 },
    },
    expectedSecondsPerStill: 12,
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
