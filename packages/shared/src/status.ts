export const PROJECT_STATUSES = [
  'setup',
  'visual_bible',
  'storyboard',
  'generating_images',
  'editing',
  'ready_to_render',
  'rendering',
  'complete',
  'error',
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  setup: 'Setup',
  visual_bible: 'Visual Bible',
  storyboard: 'Storyboard',
  generating_images: 'Generating Images',
  editing: 'Editing',
  ready_to_render: 'Ready to Render',
  rendering: 'Rendering',
  complete: 'Complete',
  error: 'Error',
};

export const EDITOR_STEPS = [
  'setup',
  'style',
  'bible',
  'characters',
  'storyboard',
  'images',
  'video',
] as const;

export type EditorStep = (typeof EDITOR_STEPS)[number];

export const EDITOR_STEP_LABELS: Record<EditorStep, string> = {
  setup: 'Song',
  style: 'Style',
  bible: 'Bible',
  characters: 'Characters',
  storyboard: 'Storyboard',
  images: 'Images',
  video: 'Video',
};

export const GENERATION_STATES = ['pending', 'generating', 'complete', 'failed'] as const;
export type GenerationState = (typeof GENERATION_STATES)[number];

export const GENERATION_STATE_LABELS: Record<GenerationState, string> = {
  pending: 'Waiting',
  generating: 'Generating',
  complete: 'Ready',
  failed: 'Failed',
};

export const RENDER_JOB_STATUSES = [
  'queued',
  'preparing',
  'rendering',
  'uploading',
  'complete',
  'failed',
] as const;
export type RenderJobStatus = (typeof RENDER_JOB_STATUSES)[number];

export const RENDER_JOB_STATUS_LABELS: Record<RenderJobStatus, string> = {
  queued: 'In queue',
  preparing: 'Preparing the cut',
  rendering: 'Rendering frames',
  uploading: 'Uploading the video',
  complete: 'Ready',
  failed: 'Failed',
};

export const ASSET_TYPES = [
  'audio',
  'character_reference',
  'scene_image',
  'final_video',
] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_SOURCES = ['ai', 'upload', 'demo'] as const;
export type AssetSource = (typeof ASSET_SOURCES)[number];

export const SONG_SECTIONS = [
  'intro',
  'verse',
  'prechorus',
  'chorus',
  'bridge',
  'instrumental',
  'outro',
  'other',
] as const;
export type SongSection = (typeof SONG_SECTIONS)[number];

export const SHOT_TYPES = [
  'extreme-wide',
  'wide',
  'medium',
  'close-up',
  'extreme-close-up',
] as const;
export type ShotType = (typeof SHOT_TYPES)[number];

export const MEDIA_TYPES = ['image', 'video'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export const PIPELINE_JOB_KINDS = ['full', 'stale_assets'] as const;
export type PipelineJobKind = (typeof PIPELINE_JOB_KINDS)[number];

export const PIPELINE_JOB_STATUSES = ['queued', 'running', 'complete', 'failed'] as const;
export type PipelineJobStatus = (typeof PIPELINE_JOB_STATUSES)[number];

export const PIPELINE_STAGES = ['bible', 'characters', 'storyboard', 'images', 'render'] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  bible: 'Visual bible',
  characters: 'Character references',
  storyboard: 'Storyboard',
  images: 'Scene stills',
  render: 'Final video',
};
