import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { projectToComposition, type CompositionProject } from '@music-video/video';
import type { MusicVideoProject } from '@music-video/shared';
import { getRepositories } from '../../api/src/repositories/index.js';
import { getObjectStorage } from '../../api/src/storage/index.js';

const execFileAsync = promisify(execFile);

function extensionFromUrl(url: string): string {
  try {
    const ext = path.extname(new URL(url).pathname);
    if (ext && ext.length <= 5) return ext;
  } catch {
    // ignore malformed URLs
  }
  return '.jpg';
}

function extensionFromMime(mimeType: string): string {
  if (mimeType.includes('svg')) return '.svg';
  if (mimeType.includes('webp')) return '.webp';
  if (mimeType.includes('png')) return '.png';
  if (mimeType.includes('gif')) return '.gif';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return '.jpg';
  return extensionFromUrl('');
}

function mimeForExtension(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.svg':
      return 'image/svg+xml';
    case '.mp4':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    default:
      return 'image/jpeg';
  }
}

async function downloadUrlToFile(url: string, dest: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    if (!response.ok || !response.body) return false;
    await pipeline(Readable.fromWeb(response.body as unknown as import('stream/web').ReadableStream), createWriteStream(dest));
    return true;
  } catch {
    return false;
  }
}

async function downloadSceneImage(
  project: MusicVideoProject,
  sceneId: string,
  imageUrl: string,
  dest: string,
): Promise<{ mimeType: string } | null> {
  const projectScene = project.scenes.find((s) => s.id === sceneId);
  const assetId = projectScene?.currentAssetId ?? projectScene?.image?.id;
  if (assetId) {
    const asset = await getRepositories().assets.get(assetId);
    if (asset?.publicUrl && (await downloadUrlToFile(asset.publicUrl, dest))) {
      return { mimeType: asset.mimeType || 'image/jpeg' };
    }
    if (asset) {
      const file = await getObjectStorage().get(asset.storagePath);
      if (file) {
        await writeFile(dest, file.body);
        return { mimeType: asset.mimeType || file.mimeType };
      }
    }
  }
  if (!imageUrl) return null;
  try {
    const response = await fetch(imageUrl);
    if (!response.ok || !response.body) return null;
    await pipeline(Readable.fromWeb(response.body as unknown as import('stream/web').ReadableStream), createWriteStream(dest));
    const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg';
    return { mimeType };
  } catch {
    return null;
  }
}

async function downloadSceneVideo(
  project: MusicVideoProject,
  sceneId: string,
  videoUrl: string,
  dest: string,
): Promise<boolean> {
  const projectScene = project.scenes.find((s) => s.id === sceneId);
  const assetId = projectScene?.currentVideoAssetId ?? projectScene?.video?.id;
  if (assetId) {
    const asset = await getRepositories().assets.get(assetId);
    if (asset?.publicUrl && (await downloadUrlToFile(asset.publicUrl, dest))) {
      return true;
    }
    if (asset) {
      const file = await getObjectStorage().get(asset.storagePath);
      if (file) {
        await writeFile(dest, file.body);
        return true;
      }
    }
  }
  if (!videoUrl) return false;
  return downloadUrlToFile(videoUrl, dest);
}

/** Loop a short clip forward to fill the scene slot — much lighter on RAM than ping-pong filter graphs. */
async function buildLoopedClip(
  inputPath: string,
  outputPath: string,
  sceneDurationSeconds: number,
): Promise<void> {
  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-stream_loop',
      '-1',
      '-i',
      inputPath,
      '-t',
      String(Math.max(0.1, sceneDurationSeconds)),
      '-an',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '28',
      '-movflags',
      '+faststart',
      outputPath,
    ],
    { timeout: 1000 * 60 * 5 },
  );
}

/** Serves prefetched stills and clips over HTTP — headless Chromium blocks file:// URLs. */
export async function startStillsServer(
  stillsDir: string,
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  await mkdir(stillsDir, { recursive: true });
  const server = http.createServer((req, res) => {
    void (async () => {
      const name = path.basename(decodeURIComponent(String(req.url ?? '/')).replace(/^\//, ''));
      if (!name || name.includes('..')) {
        res.statusCode = 400;
        res.end();
        return;
      }
      const filePath = path.join(stillsDir, name);
      if (!filePath.startsWith(stillsDir)) {
        res.statusCode = 403;
        res.end();
        return;
      }
      try {
        const info = await stat(filePath);
        if (!info.isFile()) throw new Error('missing');
        res.setHeader('Content-Type', mimeForExtension(path.extname(filePath)));
        res.setHeader('Cache-Control', 'no-store');
        createReadStream(filePath).pipe(res);
      } catch {
        res.statusCode = 404;
        res.end();
      }
    })();
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  if (!port) {
    server.close();
    throw new Error('Could not start stills server.');
  }

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function prefetchSceneAssets(
  project: MusicVideoProject,
  scene: CompositionProject['scenes'][number],
  stillsDir: string,
  assetsBaseUrl: string,
): Promise<{ scene: CompositionProject['scenes'][number]; prefetched: number }> {
  let next = scene;
  let prefetched = 0;

  const extGuess = extensionFromUrl(scene.imageUrl);
  const imageDest = path.join(stillsDir, `${scene.id}${extGuess}`);
  const image = await downloadSceneImage(project, scene.id, scene.imageUrl, imageDest);
  if (image) {
    const ext = extensionFromMime(image.mimeType) || extGuess;
    const filename = `${scene.id}${ext}`;
    const dest = path.join(stillsDir, filename);
    if (dest !== imageDest) {
      await rename(imageDest, dest);
    }
    prefetched += 1;
    next = { ...next, imageUrl: `${assetsBaseUrl}/${filename}` };
  }

  if (scene.videoUrl) {
    const rawFilename = `${scene.id}-clip.mp4`;
    const rawDest = path.join(stillsDir, rawFilename);
    if (await downloadSceneVideo(project, scene.id, scene.videoUrl, rawDest)) {
      const projectScene = project.scenes.find((s) => s.id === scene.id);
      const clipDurationSeconds =
        scene.videoDurationSeconds ??
        projectScene?.video?.durationSeconds ??
        Math.max(0.1, scene.endTime - scene.startTime);
      const sceneDurationSeconds = Math.max(0.1, scene.endTime - scene.startTime);

      if (clipDurationSeconds + 0.05 < sceneDurationSeconds) {
        const extendedFilename = `${scene.id}-clip-extended.mp4`;
        const extendedDest = path.join(stillsDir, extendedFilename);
        await buildLoopedClip(rawDest, extendedDest, sceneDurationSeconds);
        await unlink(rawDest).catch(() => undefined);
        prefetched += 1;
        next = {
          ...next,
          videoUrl: `${assetsBaseUrl}/${extendedFilename}`,
          videoDurationSeconds: sceneDurationSeconds,
        };
      } else {
        prefetched += 1;
        next = {
          ...next,
          videoUrl: `${assetsBaseUrl}/${rawFilename}`,
          videoDurationSeconds: clipDurationSeconds,
        };
      }
    }
  }

  return { scene: next, prefetched };
}

/** Prefetch one scene at a time — parallel ffmpeg + buffers OOM 50-scene exports on 2GB workers. */
export async function prefetchCompositionStills(
  project: MusicVideoProject,
  stillsDir: string,
  assetsBaseUrl: string,
  options?: {
    onScene?: (info: { index: number; total: number; sceneId: string; hasVideo: boolean }) => void;
  },
): Promise<{ composition: CompositionProject; prefetched: number; total: number }> {
  await mkdir(stillsDir, { recursive: true });
  const base = projectToComposition(project);
  let prefetched = 0;
  const scenes: CompositionProject['scenes'] = [];

  for (let index = 0; index < base.scenes.length; index += 1) {
    const scene = base.scenes[index]!;
    options?.onScene?.({
      index,
      total: base.scenes.length,
      sceneId: scene.id,
      hasVideo: Boolean(scene.videoUrl),
    });
    const result = await prefetchSceneAssets(project, scene, stillsDir, assetsBaseUrl);
    prefetched += result.prefetched;
    scenes.push(result.scene);
  }

  return { composition: { ...base, scenes }, prefetched, total: base.scenes.length };
}

export function createRenderStallGuard(options: {
  stallMs: number;
  onStall: () => void;
  pollMs?: number;
}): { touch: () => void; stop: () => void } {
  let lastActivity = Date.now();
  const pollMs = options.pollMs ?? 10_000;
  const timer = setInterval(() => {
    if (Date.now() - lastActivity > options.stallMs) {
      options.onStall();
    }
  }, pollMs);
  return {
    touch: () => {
      lastActivity = Date.now();
    },
    stop: () => clearInterval(timer),
  };
}
