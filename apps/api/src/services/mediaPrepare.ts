import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Stay under typical Supabase bucket object limits with headroom. */
export const MAX_SCENE_VIDEO_STORAGE_BYTES = 4 * 1024 * 1024;

/** fal.ai storage uploads reject very large stills — compress when needed. */
export const MAX_FAL_STILL_UPLOAD_BYTES = 9 * 1024 * 1024;

export function isPublicRemoteUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    return !['localhost', '127.0.0.1'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

export async function prepareStillForFalUpload(
  body: Buffer,
  mimeType: string,
): Promise<{ body: Buffer; mimeType: string }> {
  if (body.byteLength <= MAX_FAL_STILL_UPLOAD_BYTES && mimeType !== 'image/svg+xml') {
    return { body, mimeType };
  }
  return compressImageToJpeg(body, 1280);
}

export async function prepareVideoForStorage(body: Buffer): Promise<Buffer> {
  if (body.byteLength <= MAX_SCENE_VIDEO_STORAGE_BYTES) return body;
  return compressVideo(body);
}

async function compressImageToJpeg(body: Buffer, maxWidth: number): Promise<{ body: Buffer; mimeType: string }> {
  const id = randomUUID();
  const inPath = path.join(tmpdir(), `${id}-still-in`);
  const outPath = path.join(tmpdir(), `${id}-still.jpg`);
  try {
    await writeFile(inPath, body);
    await execFileAsync(
      'ffmpeg',
      ['-y', '-i', inPath, '-vf', `scale='min(${maxWidth},iw)':-2`, '-q:v', '4', outPath],
      { timeout: 60_000 },
    );
    return { body: await readFile(outPath), mimeType: 'image/jpeg' };
  } finally {
    await unlink(inPath).catch(() => undefined);
    await unlink(outPath).catch(() => undefined);
  }
}

async function compressVideo(body: Buffer): Promise<Buffer> {
  const id = randomUUID();
  const inPath = path.join(tmpdir(), `${id}-clip-in.mp4`);
  const outPath = path.join(tmpdir(), `${id}-clip-out.mp4`);
  try {
    await writeFile(inPath, body);
    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-i',
        inPath,
        '-an',
        '-vf',
        'scale=1280:-2',
        '-c:v',
        'libx264',
        '-crf',
        '28',
        '-preset',
        'fast',
        '-movflags',
        '+faststart',
        outPath,
      ],
      { timeout: 120_000 },
    );
    return await readFile(outPath);
  } finally {
    await unlink(inPath).catch(() => undefined);
    await unlink(outPath).catch(() => undefined);
  }
}
