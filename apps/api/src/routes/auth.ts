import { Router } from 'express';
import { accessCodeBodySchema } from '@music-video/shared';
import { accessGateEnabled, openaiConfigured, supabaseConfigured } from '../config.js';
import {
  clearSessionCookie,
  createSessionToken,
  setSessionCookie,
  verifyAccessCode,
  verifySessionToken,
} from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AppError, ERROR_CODES } from '@music-video/shared';

export const authRouter = Router();

authRouter.get(
  '/session',
  asyncHandler(async (req, res) => {
    const gated = accessGateEnabled();
    const token = req.cookies?.mv_session as string | undefined;
    const authenticated = !gated || verifySessionToken(token);
    res.json({
      authenticated,
      accessRequired: gated,
      demoMode: !openaiConfigured(),
      openaiConfigured: openaiConfigured(),
      supabaseConfigured: supabaseConfigured(),
    });
  }),
);

authRouter.post(
  '/access',
  asyncHandler(async (req, res) => {
    if (!accessGateEnabled()) {
      const token = createSessionToken();
      setSessionCookie(res, token);
      res.json({ authenticated: true });
      return;
    }
    const { code } = accessCodeBodySchema.parse(req.body);
    if (!verifyAccessCode(code)) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, 'That access code is not valid.', 401);
    }
    setSessionCookie(res, createSessionToken());
    res.json({ authenticated: true });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (_req, res) => {
    clearSessionCookie(res);
    res.json({ authenticated: false });
  }),
);
