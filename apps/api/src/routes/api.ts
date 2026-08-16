import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import {
  clientDurationBodySchema,
  computeProjectHealth,
  createSceneBodySchema,
  patchSceneBodySchema,
  patchVisualBibleBodySchema,
  reorderScenesBodySchema,
  validateSceneTiming,
  VISUAL_STYLE_PRESETS,
} from '@music-video/shared';
import { asyncHandler, param } from '../middleware/errorHandler.js';
import { readAudioDuration, sanitizeFilename, validateAudioUpload } from '../services/audio.js';
import { generateProjectStoryboard, generateProjectVisualBible, patchVisualBible } from '../services/aiService.js';
import {
  approveCharacterReference,
  generateCharacterReference,
  generateMissingImages,
  generateSceneImage,
} from '../services/images.js';
import {
  addScene,
  createProject,
  deleteProject,
  deleteScene,
  duplicateProject,
  duplicateScene,
  getProjectOrThrow,
  listProjects,
  patchProject,
  reorderScenes,
  restoreSceneAsset,
  saveProject,
  storeGeneratedFile,
  updateScene,
} from '../services/projects.js';
import { enqueueRender, getRenderJob, listRenderJobs } from '../services/render.js';
import {
  assertPipelineNotLocked,
  enqueueGenerateAll,
  enqueueStaleAssets,
  ensureShareId,
  getPipelineStatus,
} from '../services/pipeline.js';
import { publicWatchPageUrl } from '../services/share.js';
import { computeStaleAssets } from '@music-video/shared';
import { AppError, ERROR_CODES } from '@music-video/shared';
import { config } from '../config.js';
import { getObjectStorage } from '../storage/index.js';
import { LocalObjectStorage } from '../storage/local.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxAudioMb * 1024 * 1024 },
});

export const apiRouter = Router();

apiRouter.get(
  '/styles',
  asyncHandler(async (_req, res) => {
    res.json({ styles: VISUAL_STYLE_PRESETS });
  }),
);

apiRouter.get(
  '/projects',
  asyncHandler(async (_req, res) => {
    res.json({ projects: await listProjects() });
  }),
);

apiRouter.post(
  '/projects',
  asyncHandler(async (req, res) => {
    const project = await createProject(req.body);
    res.status(201).json({ project });
  }),
);

apiRouter.get(
  '/projects/:id',
  asyncHandler(async (req, res) => {
    const project = await getProjectOrThrow(param(req, 'id'));
    const pipeline = await getPipelineStatus(param(req, 'id'));
    res.json({
      project,
      health: computeProjectHealth(project),
      timingIssues: validateSceneTiming(project.scenes, project.durationSeconds),
      pipeline,
      stale: computeStaleAssets(project),
    });
  }),
);

apiRouter.patch(
  '/projects/:id',
  asyncHandler(async (req, res) => {
    await assertPipelineNotLocked(param(req, 'id'));
    const project = await patchProject(param(req, 'id'), req.body);
    res.json({ project, health: computeProjectHealth(project) });
  }),
);

apiRouter.delete(
  '/projects/:id',
  asyncHandler(async (req, res) => {
    await deleteProject(param(req, 'id'));
    res.status(204).end();
  }),
);

apiRouter.post(
  '/projects/:id/duplicate',
  asyncHandler(async (req, res) => {
    const project = await duplicateProject(param(req, 'id'));
    res.status(201).json({ project });
  }),
);

apiRouter.post(
  '/projects/:id/audio',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new AppError(ERROR_CODES.VALIDATION, 'Choose an audio file to upload.', 400);
    }
    validateAudioUpload(req.file);
    const project = await getProjectOrThrow(param(req, 'id'));
    const filename = sanitizeFilename(req.file.originalname);
    const duration =
      (await readAudioDuration(req.file.buffer, req.file.mimetype)) ??
      (typeof req.body.durationSeconds === 'string' ? Number(req.body.durationSeconds) : undefined);
    const asset = await storeGeneratedFile({
      projectId: project.id,
      type: 'audio',
      source: 'upload',
      filename,
      body: req.file.buffer,
      mimeType: req.file.mimetype || 'audio/mpeg',
      durationSeconds: duration,
    });
    const saved = await saveProject({
      ...project,
      audio: {
        url: asset.publicUrl,
        filename,
        durationSeconds: duration ?? project.durationSeconds,
        mimeType: asset.mimeType,
        assetId: asset.id,
      },
      durationSeconds: duration ?? project.durationSeconds,
      songTitle: project.songTitle || filename.replace(/\.[^.]+$/, ''),
      lyricAlignment: undefined,
    });
    res.json({ project: saved, asset, durationDetected: Boolean(duration) });
  }),
);

apiRouter.post(
  '/projects/:id/duration',
  asyncHandler(async (req, res) => {
    const { durationSeconds } = clientDurationBodySchema.parse(req.body);
    const project = await getProjectOrThrow(param(req, 'id'));
    if (project.durationSeconds > 0) {
      res.json({ project });
      return;
    }
    const saved = await saveProject({
      ...project,
      durationSeconds,
      audio: project.audio ? { ...project.audio, durationSeconds } : project.audio,
    });
    res.json({ project: saved });
  }),
);

apiRouter.post(
  '/projects/:id/visual-bible/generate',
  asyncHandler(async (req, res) => {
    await assertPipelineNotLocked(param(req, 'id'));
    const result = await generateProjectVisualBible(param(req, 'id'));
    res.json(result);
  }),
);

apiRouter.patch(
  '/projects/:id/visual-bible',
  asyncHandler(async (req, res) => {
    await assertPipelineNotLocked(param(req, 'id'));
    const body = patchVisualBibleBodySchema.parse(req.body);
    const project = await patchVisualBible(param(req, 'id'), body);
    res.json({ project });
  }),
);

apiRouter.post(
  '/projects/:id/characters/:characterId/reference',
  asyncHandler(async (req, res) => {
    const force = req.body?.force === true;
    const result = await generateCharacterReference(param(req, 'id'), param(req, 'characterId'), force);
    res.json(result);
  }),
);

apiRouter.post(
  '/projects/:id/characters/:characterId/approve',
  asyncHandler(async (req, res) => {
    const locked = req.body?.locked !== false;
    const project = await approveCharacterReference(param(req, 'id'), param(req, 'characterId'), locked);
    res.json({ project });
  }),
);

apiRouter.post(
  '/projects/:id/storyboard/generate',
  asyncHandler(async (req, res) => {
    await assertPipelineNotLocked(param(req, 'id'));
    const result = await generateProjectStoryboard(param(req, 'id'));
    res.json(result);
  }),
);

apiRouter.post(
  '/projects/:id/scenes',
  asyncHandler(async (req, res) => {
    const body = createSceneBodySchema.parse(req.body ?? {});
    const project = await addScene(param(req, 'id'), body.afterSceneId);
    res.status(201).json({ project });
  }),
);

apiRouter.patch(
  '/projects/:id/scenes/:sceneId',
  asyncHandler(async (req, res) => {
    await assertPipelineNotLocked(param(req, 'id'));
    const patch = patchSceneBodySchema.parse(req.body);
    const project = await updateScene(param(req, 'id'), param(req, 'sceneId'), patch);
    res.json({ project, health: computeProjectHealth(project) });
  }),
);

apiRouter.delete(
  '/projects/:id/scenes/:sceneId',
  asyncHandler(async (req, res) => {
    const project = await deleteScene(param(req, 'id'), param(req, 'sceneId'));
    res.json({ project });
  }),
);

apiRouter.post(
  '/projects/:id/scenes/:sceneId/duplicate',
  asyncHandler(async (req, res) => {
    const project = await duplicateScene(param(req, 'id'), param(req, 'sceneId'));
    res.json({ project });
  }),
);

apiRouter.post(
  '/projects/:id/scenes/reorder',
  asyncHandler(async (req, res) => {
    const { sceneIds } = reorderScenesBodySchema.parse(req.body);
    const project = await reorderScenes(param(req, 'id'), sceneIds);
    res.json({ project });
  }),
);

apiRouter.post(
  '/projects/:id/scenes/:sceneId/image',
  asyncHandler(async (req, res) => {
    const result = await generateSceneImage(param(req, 'id'), param(req, 'sceneId'));
    res.json(result);
  }),
);

apiRouter.post(
  '/projects/:id/scenes/:sceneId/image/upload',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new AppError(ERROR_CODES.VALIDATION, 'Choose an image to upload.', 400);
    if (!req.file.mimetype.startsWith('image/')) {
      throw new AppError(ERROR_CODES.VALIDATION, 'Upload a PNG, JPEG, or WebP image.', 400);
    }
    if (req.file.size > 12 * 1024 * 1024) {
      throw new AppError(ERROR_CODES.VALIDATION, 'Keep replacement images under 12 MB.', 400);
    }
    const project = await getProjectOrThrow(param(req, 'id'));
    const asset = await storeGeneratedFile({
      projectId: project.id,
      type: 'scene_image',
      source: 'upload',
      filename: sanitizeFilename(req.file.originalname),
      body: req.file.buffer,
      mimeType: req.file.mimetype,
    });
    const { attachAssetToScene } = await import('../services/projects.js');
    const saved = await attachAssetToScene(project, param(req, 'sceneId'), asset);
    res.json({ project: saved, asset });
  }),
);

apiRouter.post(
  '/projects/:id/scenes/:sceneId/image/restore',
  asyncHandler(async (req, res) => {
    const assetId = String(req.body?.assetId ?? '').trim();
    if (!assetId) {
      throw new AppError(ERROR_CODES.VALIDATION, 'Choose an image version to restore.', 400);
    }
    const project = await restoreSceneAsset(param(req, 'id'), param(req, 'sceneId'), assetId);
    res.json({ project });
  }),
);

apiRouter.post(
  '/projects/:id/images/generate-missing',
  asyncHandler(async (req, res) => {
    const project = await generateMissingImages(param(req, 'id'));
    res.json({ project });
  }),
);

apiRouter.post(
  '/projects/:id/generate-all',
  asyncHandler(async (req, res) => {
    const job = await enqueueGenerateAll(param(req, 'id'));
    res.status(201).json({ job });
  }),
);

apiRouter.post(
  '/projects/:id/regenerate-stale',
  asyncHandler(async (req, res) => {
    const job = await enqueueStaleAssets(param(req, 'id'));
    res.status(201).json({ job });
  }),
);

apiRouter.get(
  '/projects/:id/pipeline',
  asyncHandler(async (req, res) => {
    const status = await getPipelineStatus(param(req, 'id'));
    const stale = computeStaleAssets(await getProjectOrThrow(param(req, 'id')));
    res.json({ ...status, stale });
  }),
);

apiRouter.post(
  '/projects/:id/share',
  asyncHandler(async (req, res) => {
    const shareId = await ensureShareId(param(req, 'id'));
    res.json({ shareId, url: publicWatchPageUrl(shareId) });
  }),
);

apiRouter.post(
  '/projects/:id/render',
  asyncHandler(async (req, res) => {
    const result = await enqueueRender(param(req, 'id'));
    res.status(201).json(result);
  }),
);

apiRouter.get(
  '/projects/:id/render-jobs',
  asyncHandler(async (req, res) => {
    res.json({ jobs: await listRenderJobs(param(req, 'id')) });
  }),
);

apiRouter.get(
  '/render-jobs/:id',
  asyncHandler(async (req, res) => {
    res.json({ job: await getRenderJob(param(req, 'id')) });
  }),
);

apiRouter.get(
  '/files/*',
  asyncHandler(async (req, res) => {
    const storage = getObjectStorage();
    const storagePath = decodeURIComponent(String(req.params[0] ?? ''));
    if (storage instanceof LocalObjectStorage && !storage.resolve(storagePath)) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'File not found.', 404);
    }
    const file = await storage.get(storagePath);
    if (!file) throw new AppError(ERROR_CODES.NOT_FOUND, 'File not found.', 404);
    sendStoredFile(req, res, file);
  }),
);

apiRouter.head(
  '/files/*',
  asyncHandler(async (req, res) => {
    const storage = getObjectStorage();
    const storagePath = decodeURIComponent(String(req.params[0] ?? ''));
    if (storage instanceof LocalObjectStorage && !storage.resolve(storagePath)) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'File not found.', 404);
    }
    const file = await storage.get(storagePath);
    if (!file) throw new AppError(ERROR_CODES.NOT_FOUND, 'File not found.', 404);
    sendStoredFile(req, res, file, true);
  }),
);

function sendStoredFile(
  req: Request,
  res: Response,
  file: { body: Buffer; mimeType: string },
  headOnly = false,
): void {
  const total = file.body.byteLength;
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Accept-Ranges', 'bytes');

  const range = req.headers.range;
  if (!range) {
    res.setHeader('Content-Length', total);
    if (headOnly) {
      res.status(200).end();
      return;
    }
    res.send(file.body);
    return;
  }

  const match = /bytes=(\d*)-(\d*)/.exec(range);
  if (!match) {
    res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
    return;
  }
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : total - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total) {
    res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
    return;
  }
  const safeEnd = Math.min(end, total - 1);
  res.status(206);
  res.setHeader('Content-Range', `bytes ${start}-${safeEnd}/${total}`);
  res.setHeader('Content-Length', safeEnd - start + 1);
  if (headOnly) {
    res.end();
    return;
  }
  res.send(file.body.subarray(start, safeEnd + 1));
}
