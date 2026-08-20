import {
  AppError,
  ERROR_CODES,
  computeProjectHealth,
  getVideoPreset,
  renderCompositionFingerprint,
  type AssetRecord,
  type MusicVideoProject,
  type RenderJob,
} from '@music-video/shared';
import { compositionDurationFrames, projectToComposition } from '@music-video/video/composition';
import { config } from '../config.js';
import { getRepositories } from '../repositories/index.js';
import { getObjectStorage } from '../storage/index.js';
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

export interface PublicWatchLyricLine {
  startTime: number;
  endTime: number;
  text: string;
  section: string;
}

export interface PublicWatchLyrics {
  text: string;
  lines: PublicWatchLyricLine[];
}

export interface PublicWatchPayload {
  title: string;
  songTitle: string;
  durationSeconds: number;
  shareId: string;
  mode: 'preview' | 'video';
  videoUrl?: string;
  preview?: PublicWatchPreview;
  lyrics?: PublicWatchLyrics;
}

export interface ShareLinkPayload {
  shareId: string;
  url: string;
  videoFileUrl?: string;
}

function publicLyricsFromProject(project: MusicVideoProject): PublicWatchLyrics | undefined {
  const text = project.lyrics.trim();
  if (project.lyricAlignment?.lines.length) {
    return {
      text,
      lines: project.lyricAlignment.lines.map((line) => ({
        startTime: line.startTime,
        endTime: line.endTime,
        text: line.text,
        section: line.section,
      })),
    };
  }

  const sceneLines = project.scenes
    .filter((scene) => scene.lyricsExcerpt?.trim())
    .map((scene) => ({
      startTime: scene.startTime,
      endTime: scene.endTime,
      text: scene.lyricsExcerpt!.trim(),
      section: scene.songSection,
    }));

  if (sceneLines.length) {
    return { text, lines: sceneLines };
  }

  if (text.length) {
    return { text, lines: [] };
  }

  return undefined;
}

export async function getLatestCompleteRenderJob(projectId: string): Promise<RenderJob | null> {
  const jobs = await getRepositories().renderJobs.listByProject(projectId);
  return jobs.find((job) => job.status === 'complete' && job.outputAssetId) ?? null;
}

export function publicWatchPageUrl(shareId: string): string {
  return `${config.appUrl.replace(/\/$/, '')}/watch/${shareId}`;
}

export function publicWatchVideoFileUrl(shareId: string): string {
  return `${config.apiUrl.replace(/\/$/, '')}/api/public/watch/${shareId}/file`;
}

export function isDirectPublicVideoUrl(publicUrl: string): boolean {
  const apiBase = config.apiUrl.replace(/\/$/, '');
  return publicUrl.startsWith('http') && !publicUrl.startsWith(`${apiBase}/api/files/`);
}

export async function getSharedVideoAsset(
  shareId: string,
): Promise<{ asset: AssetRecord; renderJob: RenderJob } | null> {
  const project = await getRepositories().projects.getByShareId(shareId);
  if (!project) return null;
  const renderJob = await getLatestCompleteRenderJob(project.id);
  if (!renderJob?.outputAssetId) return null;
  const asset = await getRepositories().assets.get(renderJob.outputAssetId);
  if (!asset) return null;
  return { asset, renderJob };
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

export async function createShareLink(projectId: string): Promise<ShareLinkPayload> {
  await assertShareable(projectId);
  const shareId = await ensureShareId(projectId);
  const renderJob = await getLatestCompleteRenderJob(projectId);
  return {
    shareId,
    url: publicWatchPageUrl(shareId),
    videoFileUrl: renderJob ? publicWatchVideoFileUrl(shareId) : undefined,
  };
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

  const lyrics = publicLyricsFromProject(hydrated);
  const renderJob = await getLatestCompleteRenderJob(hydrated.id);
  if (renderJob?.outputAssetId) {
    return {
      title: hydrated.name,
      songTitle: hydrated.songTitle,
      durationSeconds: hydrated.durationSeconds,
      shareId,
      mode: 'video',
      videoUrl: publicWatchVideoFileUrl(shareId),
      lyrics,
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
    lyrics,
  };
}

export async function getSharedVideoFile(shareId: string): Promise<{ body: Buffer; mimeType: string } | null> {
  const shared = await getSharedVideoAsset(shareId);
  if (!shared) return null;
  return getObjectStorage().get(shared.asset.storagePath);
}

export async function markRenderFingerprint(projectId: string): Promise<void> {
  const project = await getProjectOrThrow(projectId);
  const fingerprint = renderCompositionFingerprint(project);
  const { saveProject } = await import('./projects.js');
  await saveProject({ ...project, renderFingerprint: fingerprint });
}
