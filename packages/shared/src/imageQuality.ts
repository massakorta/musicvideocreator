export type ImageQualityId = 'low-fast' | 'good' | 'high';

/** @deprecated Stored on older projects — maps to `high`. */
export type LegacyImageQualityId = 'highest';

export type StoredImageQualityId = ImageQualityId | LegacyImageQualityId;

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
    description: 'Sharpest stills for final scenes — slowest and most expensive tier.',
    falEndpoint: 'fal-ai/flux-2',
    falOptions: {
      image_size: { width: 1536, height: 1024 },
    },
    expectedSecondsPerStill: 8,
    accent: '#E8B86D',
    secondary: '#8B6F47',
  },
];

export const DEFAULT_IMAGE_QUALITY_ID: ImageQualityId = 'high';

/** Stills always generate at high quality — no user-facing tier picker. */
export const FIXED_IMAGE_QUALITY_ID: ImageQualityId = 'high';

export const IMAGE_GENERATION_EXPECTED_SECONDS_PER_STILL =
  IMAGE_QUALITY_PRESETS.find((preset) => preset.id === FIXED_IMAGE_QUALITY_ID)?.expectedSecondsPerStill ?? 8;

const LEGACY_IMAGE_QUALITY_MAP: Record<LegacyImageQualityId, ImageQualityId> = {
  highest: 'high',
};

export function normalizeImageQualityId(id: string | undefined): ImageQualityId {
  if (!id) return DEFAULT_IMAGE_QUALITY_ID;
  if (id in LEGACY_IMAGE_QUALITY_MAP) {
    return LEGACY_IMAGE_QUALITY_MAP[id as LegacyImageQualityId];
  }
  if (IMAGE_QUALITY_PRESETS.some((preset) => preset.id === id)) {
    return id as ImageQualityId;
  }
  return DEFAULT_IMAGE_QUALITY_ID;
}

export function getImageQuality(id: string | undefined): ImageQualityPreset {
  return (
    IMAGE_QUALITY_PRESETS.find((preset) => preset.id === normalizeImageQualityId(id)) ??
    IMAGE_QUALITY_PRESETS[0]!
  );
}

export function resolveProjectImageQualityId(_project?: {
  imageQualityId?: StoredImageQualityId;
}): ImageQualityId {
  return FIXED_IMAGE_QUALITY_ID;
}

export function effectiveGeneratedImageQualityId(project: {
  generatedImageQualityId?: StoredImageQualityId;
}): ImageQualityId {
  return normalizeImageQualityId(project.generatedImageQualityId);
}

export function imagesNeedQualityRegenerate(_project: {
  imageQualityId?: StoredImageQualityId;
  generatedImageQualityId?: StoredImageQualityId;
  scenes: Array<{ currentAssetId?: string; image?: unknown }>;
}): boolean {
  return false;
}
