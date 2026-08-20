import { createWriteStream } from 'node:fs';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

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

export async function downloadUrlToFile(url: string, timeoutMs = 300_000): Promise<string> {
  const dest = path.join(tmpdir(), `${randomUUID()}-clip-raw.mp4`);
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    throw new Error('Failed to download generated video.');
  }
  const body = response.body;
  if (!body) {
    throw new Error('Failed to download generated video.');
  }
  await pipeline(
    Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]),
    createWriteStream(dest),
  );
  return dest;
}

/** Re-encode to a smaller 720p clip on disk — avoids holding large MP4s in RAM. */
export async function prepareVideoFileForStorage(inputPath: string): Promise<string> {
  const outPath = path.join(tmpdir(), `${randomUUID()}-clip-ready.mp4`);
  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-i',
      inputPath,
      '-an',
      '-vf',
      'scale=1280:-2',
      '-c:v',
      'libx264',
      '-crf',
      '28',
      '-preset',
      'veryfast',
      '-movflags',
      '+faststart',
      outPath,
    ],
    { timeout: 120_000 },
  );
  await unlink(inputPath).catch(() => undefined);
  return outPath;
}

export async function removeTempFile(filePath: string | undefined): Promise<void> {
  if (!filePath) return;
  await unlink(filePath).catch(() => undefined);
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
