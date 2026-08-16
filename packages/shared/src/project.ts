import type { MotionPresetId } from './motion.js';
import type {
  AssetSource,
  AssetType,
  EditorStep,
  PipelineJobKind,
  PipelineJobStatus,
  PipelineStage,
  ProjectStatus,
  RenderJobStatus,
} from './status.js';
import type { LyricAlignment } from './lyricAlignment.js';
import type { StoryboardScene } from './storyboard.js';
import type { VideoFormatId } from './videoConfig.js';
import type { VisualBible } from './visualBible.js';

export interface AudioInfo {
  url: string;
  filename: string;
  durationSeconds: number;
  mimeType: string;
  assetId?: string;
}

export interface MusicVideoProject {
  id: string;
  name: string;
  songTitle: string;
  status: ProjectStatus;
  styleId?: string;
  audio?: AudioInfo;
  durationSeconds: number;
  lyrics: string;
  lyricAlignment?: LyricAlignment;
  visualBible?: VisualBible;
  visualBibleApproved: boolean;
  scenes: StoryboardScene[];
  thumbnailUrl?: string;
  formatId: VideoFormatId;
  captionsEnabled: boolean;
  lastError?: string;
  shareId?: string;
  renderFingerprint?: string;
  lastRenderJobId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PipelineJob {
  id: string;
  projectId: string;
  kind: PipelineJobKind;
  status: PipelineJobStatus;
  stage: PipelineStage;
  progress: number;
  stageDetail?: string;
  expectedSeconds: number;
  charactersDone: number;
  charactersTotal: number;
  imagesDone: number;
  imagesTotal: number;
  renderJobId?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  claimedBy?: string;
}

export interface PipelineStatus {
  active: boolean;
  job: PipelineJob | null;
  etaAt?: string;
  stageLabel?: string;
}

export interface StaleAssets {
  staleCharacterIds: string[];
  staleSceneIds: string[];
  videoStale: boolean;
  totalStaleImages: number;
}

export interface ProjectSummary {
  id: string;
  name: string;
  songTitle: string;
  thumbnailUrl?: string;
  durationSeconds: number;
  status: ProjectStatus;
  updatedAt: string;
  progress: number;
  nextStep: EditorStep;
  pipelineActive?: boolean;
  pipelineProgress?: number;
  pipelineStage?: string;
  pipelineEtaAt?: string;
}

export interface RenderJob {
  id: string;
  projectId: string;
  status: RenderJobStatus;
  progress: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  outputUrl?: string;
  outputAssetId?: string;
  error?: string;
  claimedBy?: string;
  fileSizeBytes?: number;
}

export interface AssetRecord {
  id: string;
  projectId: string;
  type: AssetType;
  source: AssetSource;
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

export interface AiUsageLog {
  id: string;
  operation: string;
  projectId?: string;
  provider: string;
  model: string;
  status: 'started' | 'success' | 'error';
  startedAt: string;
  completedAt?: string;
  error?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface ProjectHealth {
  storyboardCoveragePercent: number;
  imagesGenerated: number;
  imagesTotal: number;
  charactersApproved: number;
  charactersTotal: number;
  timingConflicts: number;
  gaps: number;
  missingImages: string[];
  missingCharacterReferences: string[];
  readyToRender: boolean;
  blockers: string[];
}

export interface DuplicateProjectOptions {
  name?: string;
}

export type ScenePatch = Partial<
  Pick<
    StoryboardScene,
    | 'title'
    | 'startTime'
    | 'endTime'
    | 'lyricsExcerpt'
    | 'description'
    | 'action'
    | 'characters'
    | 'environmentId'
    | 'shotType'
    | 'cameraIntent'
    | 'visualComedy'
    | 'imagePrompt'
    | 'negativePrompt'
    | 'motion'
    | 'suggestedMotion'
    | 'transitionIn'
    | 'transitionOut'
    | 'approved'
  >
>;

export interface CreateProjectInput {
  name: string;
  songTitle?: string;
  lyrics?: string;
}

export interface AccessSession {
  authenticated: boolean;
  demoMode: boolean;
  openaiConfigured: boolean;
  supabaseConfigured: boolean;
}

export type { MotionPresetId };
