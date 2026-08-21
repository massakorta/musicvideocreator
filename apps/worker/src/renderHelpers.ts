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

async function probeVideoDurationSeconds(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    const value = Number.parseFloat(stdout.trim());
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function buildPingPongFilter(clipDurationSeconds: number, sceneDurationSeconds: number): string {
  const clip = Math.max(0.1, clipDurationSeconds);
  const scene = Math.max(0.1, sceneDurationSeconds);

  if (scene <= clip + 0.01) {
    return `[0:v]trim=end=${scene},setpts=PTS-STARTPTS[out]`;
  }

  const reverseLen = Math.min(clip, scene - clip);
  const cycleLen = clip + reverseLen;

  if (scene <= cycleLen + 0.01) {
    return [
      `[0:v]trim=end=${clip},setpts=PTS-STARTPTS[fwd]`,
      `[0:v]trim=end=${clip},reverse,trim=end=${reverseLen},setpts=PTS-STARTPTS[rev]`,
      `[fwd][rev]concat=n=2:v=1:a=0,setpts=PTS-STARTPTS[out]`,
    ].join(';');
  }

  const extraForward = scene - cycleLen;
  return [
    `[0:v]trim=end=${clip},setpts=PTS-STARTPTS[fwd]`,
    `[0:v]trim=end=${clip},reverse,trim=end=${reverseLen},setpts=PTS-STARTPTS[rev]`,
    `[0:v]trim=end=${clip},setpts=PTS-STARTPTS[fwd2]`,
    `[fwd][rev]concat=n=2:v=1:a=0[cycle]`,
    `[fwd2]trim=end=${extraForward},setpts=PTS-STARTPTS[extra]`,
    `[cycle][extra]concat=n=2:v=1:a=0,setpts=PTS-STARTPTS[out]`,
  ].join(';');
}

function withExportFps(filter: string, fps: number): string {
  return filter.replace('[out]', `[prefps];[prefps]fps=fps=${fps}[out]`);
}

/** Bake ping-pong timing into a CFR clip Remotion can seek reliably. */
async function buildPingPongClip(
  inputPath: string,
  outputPath: string,
  clipDurationSeconds: number,
  sceneDurationSeconds: number,
  exportFps: number,
): Promise<number> {
  const filter = withExportFps(
    buildPingPongFilter(clipDurationSeconds, sceneDurationSeconds),
    exportFps,
  );
  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-i',
      inputPath,
      '-filter_complex',
      filter,
      '-map',
      '[out]',
      '-an',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '28',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      outputPath,
    ],
    { timeout: 1000 * 60 * 5 },
  );
  return (await probeVideoDurationSeconds(outputPath)) ?? sceneDurationSeconds;
}

/** Re-encode to constant frame rate so Remotion frame extraction stays in sync. */
async function normalizeVideoClip(
  inputPath: string,
  outputPath: string,
  exportFps: number,
): Promise<number> {
  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-i',
      inputPath,
      '-an',
      '-vf',
      `fps=fps=${exportFps}`,
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '28',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      outputPath,
    ],
    { timeout: 1000 * 60 * 5 },
  );
  return (await probeVideoDurationSeconds(outputPath)) ?? 0;
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
  exportFps: number,
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
        const bakedDuration = await buildPingPongClip(
          rawDest,
          extendedDest,
          clipDurationSeconds,
          sceneDurationSeconds,
          exportFps,
        );
        await unlink(rawDest).catch(() => undefined);
        prefetched += 1;
        next = {
          ...next,
          videoUrl: `${assetsBaseUrl}/${extendedFilename}`,
          videoDurationSeconds: bakedDuration,
        };
      } else {
        const normalizedFilename = `${scene.id}-clip-normalized.mp4`;
        const normalizedDest = path.join(stillsDir, normalizedFilename);
        const bakedDuration = await normalizeVideoClip(rawDest, normalizedDest, exportFps);
        await unlink(rawDest).catch(() => undefined);
        prefetched += 1;
        next = {
          ...next,
          videoUrl: `${assetsBaseUrl}/${normalizedFilename}`,
          videoDurationSeconds: bakedDuration > 0 ? bakedDuration : clipDurationSeconds,
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
    exportFps?: number;
    onScene?: (info: { index: number; total: number; sceneId: string; hasVideo: boolean }) => void;
  },
): Promise<{ composition: CompositionProject; prefetched: number; total: number }> {
  await mkdir(stillsDir, { recursive: true });
  const base = projectToComposition(project);
  const exportFps = options?.exportFps ?? 15;
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
    const result = await prefetchSceneAssets(project, scene, stillsDir, assetsBaseUrl, exportFps);
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
