export const ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  VALIDATION: 'VALIDATION',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  AUDIO_TOO_LARGE: 'AUDIO_TOO_LARGE',
  AUDIO_TYPE: 'AUDIO_TYPE',
  OPENAI_MISSING: 'OPENAI_MISSING',
  OPENAI_FAILED: 'OPENAI_FAILED',
  IMAGE_FAILED: 'IMAGE_FAILED',
  VIDEO_FAILED: 'VIDEO_FAILED',
  RENDER_NOT_READY: 'RENDER_NOT_READY',
  RENDER_FAILED: 'RENDER_FAILED',
  STORAGE_FAILED: 'STORAGE_FAILED',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  details?: unknown;
}
