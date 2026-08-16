import { AppError, ERROR_CODES, computeProjectHealth, type RenderJob } from '@music-video/shared';
import { getRepositories } from '../repositories/index.js';
import { getProjectOrThrow, saveProject } from './projects.js';
import { newId, nowIso } from './projectUtils.js';

export async function enqueueRender(projectId: string): Promise<{ project: Awaited<ReturnType<typeof getProjectOrThrow>>; job: RenderJob }> {
  const project = await getProjectOrThrow(projectId);
  const health = computeProjectHealth(project);
  if (!health.readyToRender) {
    throw new AppError(ERROR_CODES.RENDER_NOT_READY, 'Cannot render yet', 400, {
      blockers: health.blockers,
      missingImages: health.missingImages,
    });
  }
  const job: RenderJob = {
    id: newId(),
    projectId,
    status: 'queued',
    progress: 0,
    createdAt: nowIso(),
  };
  await getRepositories().renderJobs.save(job);
  const saved = await saveProject({ ...project, status: 'rendering', lastError: undefined });
  return { project: saved, job };
}

export async function getRenderJob(id: string): Promise<RenderJob> {
  const job = await getRepositories().renderJobs.get(id);
  if (!job) throw new AppError(ERROR_CODES.NOT_FOUND, 'That render job could not be found.', 404);
  return job;
}

export async function listRenderJobs(projectId: string): Promise<RenderJob[]> {
  await getProjectOrThrow(projectId);
  return getRepositories().renderJobs.listByProject(projectId);
}
