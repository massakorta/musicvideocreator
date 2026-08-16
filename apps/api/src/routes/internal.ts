import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { AppError, ERROR_CODES } from '@music-video/shared';
import { config } from '../config.js';
import { asyncHandler, param } from '../middleware/errorHandler.js';
import { getRepositories } from '../repositories/index.js';
import { getProjectOrThrow, saveProject, storeGeneratedFile } from '../services/projects.js';

export const internalRouter = Router();

internalRouter.use((req, _res, next) => {
  const secret = req.header('x-worker-secret') ?? '';
  const expected = config.sessionSecret;
  const a = Buffer.from(secret);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    next(new AppError(ERROR_CODES.UNAUTHORIZED, 'Worker authentication failed.', 401));
    return;
  }
  next();
});

internalRouter.post(
  '/jobs/claim',
  asyncHandler(async (_req, res) => {
    const job = await getRepositories().renderJobs.claimNext(config.workerId);
    res.json({ job });
  }),
);

internalRouter.patch(
  '/jobs/:id',
  asyncHandler(async (req, res) => {
    const current = await getRepositories().renderJobs.get(param(req, 'id'));
    if (!current) throw new AppError(ERROR_CODES.NOT_FOUND, 'Job not found.', 404);
    const job = { ...current, ...req.body, id: current.id, projectId: current.projectId };
    await getRepositories().renderJobs.save(job);
    if (job.status === 'complete' || job.status === 'failed') {
      const project = await getProjectOrThrow(job.projectId);
      await saveProject({
        ...project,
        status: job.status === 'complete' ? 'complete' : 'error',
        lastError: job.error,
        thumbnailUrl: project.thumbnailUrl,
      });
    }
    res.json({ job });
  }),
);

internalRouter.get(
  '/projects/:id',
  asyncHandler(async (req, res) => {
    const project = await getProjectOrThrow(param(req, 'id'));
    res.json({ project });
  }),
);

internalRouter.post(
  '/projects/:id/final-video',
  asyncHandler(async (req, res) => {
    const buffer = Buffer.from(String(req.body.base64 ?? ''), 'base64');
    if (!buffer.length) throw new AppError(ERROR_CODES.VALIDATION, 'Missing video bytes.', 400);
    const asset = await storeGeneratedFile({
      projectId: param(req, 'id'),
      type: 'final_video',
      source: 'upload',
      filename: 'music-video.mp4',
      body: buffer,
      mimeType: 'video/mp4',
      durationSeconds: Number(req.body.durationSeconds) || undefined,
    });
    res.json({ asset });
  }),
);
