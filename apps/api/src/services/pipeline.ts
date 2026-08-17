import { randomBytes } from 'node:crypto';
import {
  AppError,
  ERROR_CODES,
  PIPELINE_STAGE_LABELS,
  computeEtaAt,
  computeStaleAssets,
  estimatePipelineSeconds,
  pipelineProgressFromJob,
  type PipelineJob,
  type PipelineJobKind,
  type PipelineStatus,
} from '@music-video/shared';
import { getRepositories } from '../repositories/index.js';
import { getProjectOrThrow, saveProject } from './projects.js';
import { newId, nowIso } from './projectUtils.js';

export async function getActivePipelineJob(projectId: string): Promise<PipelineJob | null> {
  return getRepositories().pipelineJobs.getActiveByProject(projectId);
}

export async function isPipelineLocked(projectId: string): Promise<boolean> {
  const active = await getActivePipelineJob(projectId);
  return Boolean(active);
}

export async function assertPipelineNotLocked(projectId: string): Promise<void> {
  if (await isPipelineLocked(projectId)) {
    throw new AppError(
      ERROR_CODES.CONFLICT,
      'A background generation job is running. Wait for it to finish or refresh the progress page.',
      409,
    );
  }
}

async function enqueuePipeline(projectId: string, kind: PipelineJobKind): Promise<PipelineJob> {
  const active = await getActivePipelineJob(projectId);
  if (active) return active;

  const project = await getProjectOrThrow(projectId);
  const stale = kind === 'stale_assets' ? computeStaleAssets(project) : undefined;
  if (kind === 'stale_assets' && stale!.totalStaleImages === 0) {
    throw new AppError(ERROR_CODES.VALIDATION, 'Nothing needs updating right now.', 400);
  }

  const expectedSeconds = estimatePipelineSeconds(project, kind, stale);
  const job: PipelineJob = {
    id: newId(),
    projectId,
    kind,
    status: 'queued',
    stage: kind === 'full' ? 'bible' : stale!.staleCharacterIds.length > 0 ? 'characters' : 'images',
    progress: 0,
    expectedSeconds,
    charactersDone: 0,
    charactersTotal: kind === 'full' ? (project.visualBible?.characters.length ?? 0) : (stale?.staleCharacterIds.length ?? 0),
    imagesDone: 0,
    imagesTotal: kind === 'full' ? project.scenes.length : (stale?.staleSceneIds.length ?? 0),
    createdAt: nowIso(),
  };
  await getRepositories().pipelineJobs.save(job);
  await saveProject({
    ...project,
    status: 'generating_images',
    lastError: undefined,
  });
  return job;
}

export async function enqueueGenerateAll(projectId: string): Promise<PipelineJob> {
  const project = await getProjectOrThrow(projectId);
  if (!project.audio) {
    throw new AppError(ERROR_CODES.VALIDATION, 'Upload a song before generating.', 400);
  }
  if (!project.styleId) {
    throw new AppError(ERROR_CODES.VALIDATION, 'Choose a visual style before generating.', 400);
  }
  return enqueuePipeline(projectId, 'full');
}

export async function enqueueStaleAssets(projectId: string): Promise<PipelineJob> {
  return enqueuePipeline(projectId, 'stale_assets');
}

export async function getPipelineStatus(projectId: string): Promise<PipelineStatus> {
  await getProjectOrThrow(projectId);
  const job = await getActivePipelineJob(projectId);
  if (!job) {
    const latest = (await getRepositories().pipelineJobs.listByProject(projectId))[0] ?? null;
    return {
      active: false,
      job: latest,
      etaAt: undefined,
      stageLabel: latest ? PIPELINE_STAGE_LABELS[latest.stage] : undefined,
    };
  }
  const progress = pipelineProgressFromJob(job);
  return {
    active: true,
    job: { ...job, progress },
    etaAt: computeEtaAt(job.startedAt, job.expectedSeconds, progress),
    stageLabel: PIPELINE_STAGE_LABELS[job.stage],
  };
}

export function createShareId(): string {
  return randomBytes(12).toString('base64url');
}

export async function ensureShareId(projectId: string): Promise<string> {
  const project = await getProjectOrThrow(projectId);
  if (project.shareId) return project.shareId;
  const shareId = createShareId();
  await saveProject({ ...project, shareId });
  return shareId;
}

export async function patchPipelineJob(job: PipelineJob, patch: Partial<PipelineJob>): Promise<PipelineJob> {
  const next = { ...job, ...patch };
  if (patch.progress === undefined && (patch.stage || patch.charactersDone !== undefined || patch.imagesDone !== undefined)) {
    next.progress = pipelineProgressFromJob(next);
  }
  await getRepositories().pipelineJobs.save(next);
  return next;
}
