import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { AppError, ERROR_CODES } from '@music-video/shared';
import { accessGateEnabled, config } from '../config.js';

const COOKIE = 'mv_session';

function sign(payload: string): string {
  return createHmac('sha256', config.sessionSecret).update(payload).digest('base64url');
}

export function createSessionToken(): string {
  const payload = Buffer.from(JSON.stringify({ v: 1, iat: Date.now() }), 'utf8').toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function verifyAccessCode(code: string): boolean {
  const expected = config.accessCode;
  const a = Buffer.from(code);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: config.isProduction && !config.appUrl.startsWith(config.apiUrl) ? 'none' : 'lax',
    secure: config.isProduction,
    signed: false,
    maxAge: 1000 * 60 * 60 * 24 * 14,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE, {
    path: '/',
    httpOnly: true,
    sameSite: config.isProduction && !config.appUrl.startsWith(config.apiUrl) ? 'none' : 'lax',
    secure: config.isProduction,
  });
}

export function requireSession(req: Request, _res: Response, next: NextFunction): void {
  if (!accessGateEnabled()) {
    next();
    return;
  }
  const token = req.cookies?.[COOKIE] as string | undefined;
  if (!verifySessionToken(token)) {
    next(new AppError(ERROR_CODES.UNAUTHORIZED, 'Enter the beta access code to continue.', 401));
    return;
  }
  next();
}
