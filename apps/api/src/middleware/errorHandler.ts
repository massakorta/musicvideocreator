import type { NextFunction, Request, Response } from 'express';
import { AppError, ERROR_CODES, type ApiErrorBody } from '@music-video/shared';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    const body: ApiErrorBody = { code: err.code, message: err.message };
    if (err.details) body.details = err.details;
    res.status(err.status).json(body);
    return;
  }

  const message = err instanceof Error ? err.message : 'Unexpected server error.';
  console.error('[api]', err);
  const body: ApiErrorBody = {
    code: ERROR_CODES.INTERNAL,
    message: 'The server hit an unexpected error. Try again in a moment.',
  };
  if (process.env.NODE_ENV !== 'production') {
    body.details = message;
  }
  res.status(500).json(body);
}

export function asyncHandler<T extends Request>(
  handler: (req: T, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: T, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}

export function param(req: Request, name: string): string {
  const value = req.params[name];
  if (!value) {
    throw new AppError(ERROR_CODES.VALIDATION, `Missing ${name}.`, 400);
  }
  return value;
}
