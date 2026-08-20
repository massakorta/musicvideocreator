import { z } from 'zod';
import { MOTION_PRESETS, TRANSITION_PRESETS } from '../motion.js';
import { ASSET_SOURCES, ASSET_TYPES, MEDIA_TYPES, PROJECT_STATUSES, SHOT_TYPES, SONG_SECTIONS } from '../status.js';
import { IMAGE_QUALITY_PRESETS, normalizeImageQualityId } from '../imageQuality.js';
import { VIDEO_PRESETS } from '../videoConfig.js';

const imageQualityIds = IMAGE_QUALITY_PRESETS.map((p) => p.id) as [
  (typeof IMAGE_QUALITY_PRESETS)[number]['id'],
  ...(typeof IMAGE_QUALITY_PRESETS)[number]['id'][],
];

const storedImageQualityIds = [...imageQualityIds, 'highest'] as const;

const imageQualityField = z
  .enum(storedImageQualityIds)
  .optional()
  .transform((id) => (id === undefined ? undefined : normalizeImageQualityId(id)));

export const hexColorSchema = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);

export const colorDefinitionSchema = z.object({
  name: z.string().min(1),
  hex: z.string().min(3),
  usage: z.string().min(1),
});

export const characterDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  ageAppearance: z.string().optional(),
  bodyType: z.string().min(1),
  face: z.string().min(1),
  hair: z.string().min(1),
  clothing: z.string().min(1),
  colors: z.array(z.string()).default([]),
  personality: z.string().min(1),
  expressions: z.array(z.string()).default([]),
  importantContinuityFeatures: z.array(z.string()).default([]),
  promptDescription: z.string().min(1),
  referenceAssetId: z.string().optional(),
  referenceUrl: z.string().optional(),
  lockedReferenceImage: z.boolean().default(false),
  referenceFingerprint: z.string().optional(),
});

export const environmentDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  layout: z.string().min(1),
  materials: z.array(z.string()).default([]),
  importantObjects: z.array(z.string()).default([]),
  lighting: z.string().min(1),
  colors: z.array(z.string()).default([]),
  continuityFeatures: z.array(z.string()).default([]),
  promptDescription: z.string().min(1),
});

export const propDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  promptDescription: z.string().min(1),
});

export const visualBibleSchema = z.object({
  projectTitle: z.string().min(1),
  overallStyle: z.object({
    visualMedium: z.string().min(1),
    mood: z.string().min(1),
    renderingStyle: z.string().min(1),
    cameraLanguage: z.string().min(1),
    animationLanguage: z.string().min(1),
  }),
  characters: z.array(characterDefinitionSchema).min(1),
  environments: z.array(environmentDefinitionSchema).min(1),
  colorPalette: z.array(colorDefinitionSchema).min(3),
  recurringProps: z.array(propDefinitionSchema).default([]),
  continuityRules: z.array(z.string()).min(1),
  negativeRules: z.array(z.string()).min(1),
  masterPrompt: z.string().min(1),
});

export const generatedAssetSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  type: z.enum(ASSET_TYPES),
  source: z.enum(ASSET_SOURCES),
  storagePath: z.string(),
  publicUrl: z.string(),
  mimeType: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
  durationSeconds: z.number().optional(),
  fileSizeBytes: z.number().optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string(),
});

export const storyboardSceneSchema = z.object({
  id: z.string(),
  order: z.number().int().positive(),
  startTime: z.number(),
  endTime: z.number(),
  duration: z.number(),
  songSection: z.enum(SONG_SECTIONS),
  lyricsExcerpt: z.string().optional(),
  title: z.string().min(1),
  description: z.string().min(1),
  action: z.string().min(1),
  characters: z.array(z.string()).default([]),
  environmentId: z.string().optional(),
  shotType: z.enum(SHOT_TYPES),
  cameraIntent: z.string().min(1),
  visualComedy: z.string().optional(),
  imagePrompt: z.string().min(1),
  negativePrompt: z.string().optional(),
  suggestedMotion: z.enum(MOTION_PRESETS),
  motion: z.enum(MOTION_PRESETS),
  transitionIn: z.enum(TRANSITION_PRESETS),
  transitionOut: z.enum(TRANSITION_PRESETS),
  mediaType: z.enum(MEDIA_TYPES).default('image'),
  image: generatedAssetSchema.optional(),
  currentAssetId: z.string().optional(),
  previousAssetIds: z.array(z.string()).default([]),
  generationState: z.enum(['pending', 'generating', 'complete', 'failed']),
  generationError: z.string().optional(),
  video: generatedAssetSchema.optional(),
  currentVideoAssetId: z.string().optional(),
  previousVideoAssetIds: z.array(z.string()).default([]),
  videoGenerationState: z.enum(['pending', 'generating', 'complete', 'failed']).default('pending'),
  videoGenerationError: z.string().optional(),
  approved: z.boolean().default(false),
  captionsEnabled: z.boolean().optional(),
  imageFingerprint: z.string().optional(),
});

export const timedWordSchema = z.object({
  start: z.number(),
  end: z.number(),
  word: z.string(),
});

export const timedLyricLineSchema = z.object({
  startTime: z.number(),
  endTime: z.number(),
  text: z.string(),
  section: z.enum(SONG_SECTIONS),
});

export const lyricAlignmentSchema = z.object({
  audioAssetId: z.string().optional(),
  source: z.enum(['whisper', 'estimated']),
  language: z.string().optional(),
  words: z.array(timedWordSchema),
  lines: z.array(timedLyricLineSchema),
  createdAt: z.string(),
});

export const audioInfoSchema = z.object({
  url: z.string(),
  filename: z.string(),
  durationSeconds: z.number().nonnegative(),
  mimeType: z.string(),
  assetId: z.string().optional(),
});

export const projectSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  songTitle: z.string(),
  status: z.enum(PROJECT_STATUSES),
  styleId: z.string().optional(),
  imageQualityId: imageQualityField,
  generatedImageQualityId: imageQualityField,
  audio: audioInfoSchema.optional(),
  durationSeconds: z.number().nonnegative(),
  lyrics: z.string(),
  lyricAlignment: lyricAlignmentSchema.optional(),
  visualBible: visualBibleSchema.optional(),
  visualBibleApproved: z.boolean(),
  scenes: z.array(storyboardSceneSchema),
  thumbnailUrl: z.string().optional(),
  formatId: z.enum(Object.keys(VIDEO_PRESETS) as [keyof typeof VIDEO_PRESETS, ...Array<keyof typeof VIDEO_PRESETS>]),
  captionsEnabled: z.boolean(),
  lastError: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createProjectBodySchema = z.object({
  name: z.string().min(1).max(120).optional(),
  songTitle: z.string().max(160).optional(),
  lyrics: z.string().max(20000).optional(),
});

export const patchProjectBodySchema = z.object({
  name: z.string().min(1).max(120).optional(),
  songTitle: z.string().max(160).optional(),
  lyrics: z.string().max(20000).optional(),
  styleId: z.string().optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  captionsEnabled: z.boolean().optional(),
  formatId: z.enum(Object.keys(VIDEO_PRESETS) as [keyof typeof VIDEO_PRESETS, ...Array<keyof typeof VIDEO_PRESETS>]).optional(),
  durationSeconds: z.number().positive().optional(),
});

export const accessCodeBodySchema = z.object({
  code: z.string().min(1).max(200),
});

export const patchVisualBibleBodySchema = visualBibleSchema.partial().extend({
  approved: z.boolean().optional(),
});

export const patchSceneBodySchema = storyboardSceneSchema.partial().omit({
  id: true,
  image: true,
  previousAssetIds: true,
  generationState: true,
  video: true,
  previousVideoAssetIds: true,
  videoGenerationState: true,
});

export const createSceneBodySchema = z.object({
  afterSceneId: z.string().optional(),
  startTime: z.number().optional(),
  endTime: z.number().optional(),
  title: z.string().optional(),
});

export const reorderScenesBodySchema = z.object({
  sceneIds: z.array(z.string()).min(1),
});

export const clientDurationBodySchema = z.object({
  durationSeconds: z.number().positive(),
});

export const sunoImportBodySchema = z.object({
  url: z.string().min(8).max(500),
});
