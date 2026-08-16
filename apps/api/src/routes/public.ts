import { Router } from 'express';
import { asyncHandler, param } from '../middleware/errorHandler.js';
import { getPublicWatch, getSharedVideoFile } from '../services/share.js';
import { config } from '../config.js';

export const publicRouter = Router();

publicRouter.get(
  '/watch/:shareId',
  asyncHandler(async (req, res) => {
    res.json({ watch: await getPublicWatch(param(req, 'shareId')) });
  }),
);

publicRouter.get(
  '/watch/:shareId/file',
  asyncHandler(async (req, res) => {
    const file = await getSharedVideoFile(param(req, 'shareId'));
    if (!file) {
      res.status(404).json({ code: 'NOT_FOUND', message: 'Video file not found.' });
      return;
    }
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(file.body);
  }),
);

publicRouter.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'public', appUrl: config.appUrl });
});
