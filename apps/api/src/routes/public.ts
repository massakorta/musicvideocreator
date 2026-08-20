import { Router } from 'express';
import { asyncHandler, param } from '../middleware/errorHandler.js';
import {
  getPublicWatch,
  getSharedVideoAsset,
  isDirectPublicVideoUrl,
} from '../services/share.js';
import { getObjectStorage } from '../storage/index.js';
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
    const shared = await getSharedVideoAsset(param(req, 'shareId'));
    if (!shared) {
      res.status(404).json({ code: 'NOT_FOUND', message: 'Video file not found.' });
      return;
    }

    if (isDirectPublicVideoUrl(shared.asset.publicUrl)) {
      res.redirect(302, shared.asset.publicUrl);
      return;
    }

    const file = await getObjectStorage().get(shared.asset.storagePath);
    if (!file) {
      res.status(404).json({ code: 'NOT_FOUND', message: 'Video file not found.' });
      return;
    }

    const size = file.body.length;
    const range = req.headers.range;
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=3600');

    if (typeof range === 'string') {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (match) {
        const start = match[1] ? Number.parseInt(match[1], 10) : 0;
        const end = match[2] ? Number.parseInt(match[2], 10) : size - 1;
        if (Number.isNaN(start) || Number.isNaN(end) || start >= size || end >= size || start > end) {
          res.status(416).setHeader('Content-Range', `bytes */${size}`).end();
          return;
        }
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
        res.setHeader('Content-Length', String(end - start + 1));
        res.send(file.body.subarray(start, end + 1));
        return;
      }
    }

    res.setHeader('Content-Length', String(size));
    res.send(file.body);
  }),
);

publicRouter.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'public', appUrl: config.appUrl });
});
