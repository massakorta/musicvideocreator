import { AppError, ERROR_CODES, renderCompositionFingerprint } from '@music-video/shared';
import { config } from '../config.js';
import { getRepositories } from '../repositories/index.js';
import { getObjectStorage } from '../storage/index.js';
import { LocalObjectStorage } from '../storage/local.js';
import { getProjectOrThrow } from './projects.js';

export interface PublicWatchPayload {
  title: string;
  songTitle: string;
  durationSeconds: number;
  videoUrl: string;
  shareId: string;
}

export async function getPublicWatch(shareId: string): Promise<PublicWatchPayload> {
  const project = await getRepositories().projects.getByShareId(shareId);
  if (!project) {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'That shared video could not be found.', 404);
  }
  const hydrated = await getProjectOrThrow(project.id);
  const jobs = await getRepositories().renderJobs.listByProject(project.id);
  const complete = jobs.find((job) => job.status === 'complete' && job.outputUrl);
  if (!complete?.outputUrl) {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'This video is not ready to watch yet.', 404);
  }
  const storage = getObjectStorage();
  const videoUrl =
    storage instanceof LocalObjectStorage
      ? `${config.apiUrl.replace(/\/$/, '')}/api/public/watch/${shareId}/file`
      : complete.outputUrl;
  return {
    title: hydrated.name,
    songTitle: hydrated.songTitle,
    durationSeconds: hydrated.durationSeconds,
    videoUrl,
    shareId,
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
