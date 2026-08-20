import type { MotionPresetId, TransitionPresetId } from './motion.js';
import type { GenerationState, MediaType, ShotType, SongSection } from './status.js';

export interface GeneratedAsset {
  id: string;
  projectId: string;
  type: 'audio' | 'character_reference' | 'scene_image' | 'scene_video' | 'final_video';
  source: 'ai' | 'upload' | 'demo';
  storagePath: string;
  publicUrl: string;
  mimeType: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  fileSizeBytes?: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface StoryboardScene {
  id: string;
  order: number;
  startTime: number;
  endTime: number;
  duration: number;
  songSection: SongSection;
  lyricsExcerpt?: string;
  title: string;
  description: string;
  action: string;
  characters: string[];
  environmentId?: string;
  shotType: ShotType;
  cameraIntent: string;
  visualComedy?: string;
  imagePrompt: string;
  negativePrompt?: string;
  suggestedMotion: MotionPresetId;
  motion: MotionPresetId;
  transitionIn: TransitionPresetId;
  transitionOut: TransitionPresetId;
  mediaType: MediaType;
  image?: GeneratedAsset;
  currentAssetId?: string;
  previousAssetIds: string[];
  generationState: GenerationState;
  generationError?: string;
  video?: GeneratedAsset;
  currentVideoAssetId?: string;
  previousVideoAssetIds: string[];
  videoGenerationState: GenerationState;
  videoGenerationError?: string;
  approved: boolean;
  captionsEnabled?: boolean;
  imageFingerprint?: string;
}
