import type { RenderJob } from './project.js';
import { RENDER_ORPHAN_MS } from './videoConfig.js';

export function isOrphanedRenderJob(job: RenderJob): boolean {
  if (job.status === 'queued' || job.status === 'complete' || job.status === 'failed') {
    return false;
  }
  if (!job.progressUpdatedAt) {
    return false;
  }
  const lastTouch = Date.parse(job.progressUpdatedAt);
  if (!Number.isFinite(lastTouch)) return false;
  return Date.now() - lastTouch > RENDER_ORPHAN_MS;
}
