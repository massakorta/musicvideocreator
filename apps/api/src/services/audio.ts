import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { parseBuffer } from 'music-metadata';
import { AppError, ERROR_CODES } from '@music-video/shared';
import { config } from '../config.js';

const execFileAsync = promisify(execFile);

const ALLOWED_EXT = new Set(['.mp3', '.wav', '.m4a']);
const ALLOWED_MIME = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/m4a',
  'application/octet-stream',
]);

export function validateAudioUpload(file: Express.Multer.File): void {
  const ext = extensionOf(file.originalname);
  if (!ALLOWED_EXT.has(ext)) {
    throw new AppError(ERROR_CODES.AUDIO_TYPE, 'Upload an MP3, WAV, or M4A file.', 400);
  }
  if (file.mimetype && !ALLOWED_MIME.has(file.mimetype)) {
    throw new AppError(
      ERROR_CODES.AUDIO_TYPE,
      `This file type (${file.mimetype}) is not supported. Use MP3, WAV, or M4A.`,
      400,
    );
  }
  const maxBytes = config.maxAudioMb * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new AppError(
      ERROR_CODES.AUDIO_TOO_LARGE,
      `Audio must be ${config.maxAudioMb} MB or smaller.`,
      413,
    );
  }
}

export function sanitizeFilename(name: string): string {
  const base = name.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, '-');
  const ext = extensionOf(base);
  const stem = base.slice(0, Math.max(1, base.length - ext.length)).slice(0, 60) || 'audio';
  return `${stem}${ALLOWED_EXT.has(ext) ? ext : '.mp3'}`;
}

export async function readAudioDuration(buffer: Buffer, mimeType: string): Promise<number | undefined> {
  const probed = await ffprobeDuration(buffer);
  if (probed && probed > 0) return probed;
  try {
    const meta = await parseBuffer(buffer, { mimeType }, { duration: true });
    if (meta.format.duration && meta.format.duration > 0) return meta.format.duration;
  } catch {
    return undefined;
  }
  return undefined;
}

async function ffprobeDuration(buffer: Buffer): Promise<number | undefined> {
  const tmp = path.join(tmpdir(), `mv-audio-${randomUUID()}`);
  try {
    await writeFile(tmp, buffer);
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      tmp,
    ], { timeout: 15000 });
    const value = Number(String(stdout).trim());
    return Number.isFinite(value) && value > 0 ? value : undefined;
  } catch {
    return undefined;
  } finally {
    await unlink(tmp).catch(() => undefined);
  }
}

function extensionOf(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx).toLowerCase() : '';
}
