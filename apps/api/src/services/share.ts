import {
  AppError,
  ERROR_CODES,
  computeProjectHealth,
  getVideoPreset,
  renderCompositionFingerprint,
} from '@music-video/shared';
import { compositionDurationFrames, projectToComposition } from '@music-video/video/composition';
import { config } from '../config.js';
import { getRepositories } from '../repositories/index.js';
import { getObjectStorage } from '../storage/index.js';
import { LocalObjectStorage } from '../storage/local.js';
import { getProjectOrThrow } from './projects.js';
import { ensureShareId } from './pipeline.js';

export interface PublicWatchPreview {
  composition: ReturnType<typeof projectToComposition>;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  audioUrl?: string;
}

export interface PublicWatchPayload {
  title: string;
  songTitle: string;
  durationSeconds: number;
  shareId: string;
  mode: 'preview' | 'video';
  videoUrl?: string;
  preview?: PublicWatchPreview;
}

export async function assertShareable(projectId: string): Promise<void> {
  const project = await getProjectOrThrow(projectId);
  const health = computeProjectHealth(project);
  if (!health.readyToRender) {
    throw new AppError(ERROR_CODES.RENDER_NOT_READY, 'Cannot share yet', 400, {
      blockers: health.blockers,
      missingImages: health.missingImages,
    });
  }
}

export async function createShareLink(projectId: string): Promise<{ shareId: string; url: string }> {
  await assertShareable(projectId);
  const shareId = await ensureShareId(projectId);
  return { shareId, url: publicWatchPageUrl(shareId) };
}

export async function getPublicWatch(shareId: string): Promise<PublicWatchPayload> {
  const project = await getRepositories().projects.getByShareId(shareId);
  if (!project) {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'That shared video could not be found.', 404);
  }
  const hydrated = await getProjectOrThrow(project.id);
  const health = computeProjectHealth(hydrated);
  if (!health.readyToRender) {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'This video is not ready to watch yet.', 404);
  }

  const jobs = await getRepositories().renderJobs.listByProject(project.id);
  const complete = jobs.find((job) => job.status === 'complete' && job.outputUrl);
  if (complete?.outputUrl) {
    const storage = getObjectStorage();
    const videoUrl =
      storage instanceof LocalObjectStorage
        ? `${config.apiUrl.replace(/\/$/, '')}/api/public/watch/${shareId}/file`
        : complete.outputUrl;
    return {
      title: hydrated.name,
      songTitle: hydrated.songTitle,
      durationSeconds: hydrated.durationSeconds,
      shareId,
      mode: 'video',
      videoUrl,
    };
  }

  const composition = projectToComposition(hydrated);
  const preset = getVideoPreset(hydrated.formatId);
  const durationInFrames = compositionDurationFrames(composition);
  return {
    title: hydrated.name,
    songTitle: hydrated.songTitle,
    durationSeconds: hydrated.durationSeconds,
    shareId,
    mode: 'preview',
    preview: {
      composition,
      durationInFrames,
      fps: preset.fps,
      width: preset.width,
      height: preset.height,
      audioUrl: hydrated.audio?.url,
    },
  };
}

export async function getSharedVideoFile(shareId: string): Promise<{ body: Buffer; mimeType: string } | null> {
  const project = await getRepositories().projects.getByShareId(shareId);
  if (!project) return null;
  const jobs = await getRepositories().renderJobs.listByProject(project.id);
  const complete = jobs.find((job) => job.status === 'complete' && job.outputAssetId);
  if (!complete?.outputAssetId) return null;
  const asset = await getRepositories().assets.get(complete.outputAssetId);
  if (!asset) return null;
  const storage = getObjectStorage();
  if (storage instanceof LocalObjectStorage) {
    const file = await storage.get(asset.storagePath);
    if (!file) return null;
    return file;
  }
  return null;
}

export function publicWatchPageUrl(shareId: string): string {
  return `${config.appUrl.replace(/\/$/, '')}/watch/${shareId}`;
}

export async function markRenderFingerprint(projectId: string): Promise<void> {
  const project = await getProjectOrThrow(projectId);
  const fingerprint = renderCompositionFingerprint(project);
  const { saveProject } = await import('./projects.js');
  await saveProject({ ...project, renderFingerprint: fingerprint });
}
