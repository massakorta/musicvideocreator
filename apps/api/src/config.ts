import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config();

function env(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

const VALID_IMAGE_SIZES = ['1536x1024', '1792x1024', '1024x1024', '1024x1536'] as const;
type ImageSize = (typeof VALID_IMAGE_SIZES)[number];

function envImageSize(name: string, fallback: ImageSize): ImageSize {
  const raw = process.env[name];
  if (raw && (VALID_IMAGE_SIZES as readonly string[]).includes(raw)) {
    return raw as ImageSize;
  }
  return fallback;
}

export const config = {
  nodeEnv: env('NODE_ENV', 'development'),
  isProduction: env('NODE_ENV') === 'production',
  repoRoot,
  dataDir: path.join(repoRoot, 'data'),
  appUrl: env('APP_URL', 'http://localhost:5173'),
  apiUrl: env('API_URL', 'http://localhost:3001'),
  apiPort: envNumber('API_PORT', 3001),
  accessCode: env('APP_ACCESS_CODE'),
  sessionSecret: env('SESSION_SECRET', 'dev-session-secret-change-me'),
  openaiApiKey: env('OPENAI_API_KEY'),
  openaiTextModel: env('OPENAI_TEXT_MODEL', 'gpt-4.1'),
  openaiImageModel: env('OPENAI_IMAGE_MODEL', 'gpt-image-1-mini'),
  openaiImageQuality: env('OPENAI_IMAGE_QUALITY', 'low'),
  openaiImageSize: envImageSize('OPENAI_IMAGE_SIZE', '1536x1024'),
  supabaseUrl: env('SUPABASE_URL'),
  supabaseServiceRoleKey: env('SUPABASE_SERVICE_ROLE_KEY'),
  supabaseBucket: env('SUPABASE_STORAGE_BUCKET', 'music-video-assets'),
  maxAudioMb: envNumber('MAX_AUDIO_MB', 50),
  imageConcurrency: envNumber('IMAGE_GENERATION_CONCURRENCY', 6),
  aiRateLimitPerMinute: envNumber('AI_RATE_LIMIT_PER_MINUTE', 80),
  workerPollMs: envNumber('WORKER_POLL_MS', 3000),
  workerId: env('WORKER_ID', `worker-${process.pid}`),
};

export function openaiConfigured(): boolean {
  return config.openaiApiKey.trim().length > 0;
}

export function supabaseConfigured(): boolean {
  return config.supabaseUrl.trim().length > 0 && config.supabaseServiceRoleKey.trim().length > 0;
}

export function accessGateEnabled(): boolean {
  return config.accessCode.trim().length > 0;
}
