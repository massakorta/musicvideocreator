import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { projectToComposition, type CompositionProject } from '@music-video/video';
import type { MusicVideoProject } from '@music-video/shared';
import {
  EXPORT_AUDIO_BITRATE,
  EXPORT_CRF,
  EXPORT_MAX_VIDEO_BITRATE,
  EXPORT_MAX_VIDEO_BUFSIZE,
} from '@music-video/shared';
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

/** Extract clip frames as JPEGs so Remotion can ping-pong without HTML video or OffthreadVideo seeking. */
async function extractClipFrames(options: {
  inputPath: string;
  stillsDir: string;
  sceneId: string;
  exportFps: number;
  width: number;
  height: number;
}): Promise<number> {
  const pattern = path.join(options.stillsDir, `${options.sceneId}-f%04d.jpg`);
  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-i',
      options.inputPath,
      '-vf',
      `fps=${options.exportFps},scale=${options.width}:${options.height}:force_original_aspect_ratio=increase,crop=${options.width}:${options.height}`,
      '-q:v',
      '3',
      pattern,
    ],
    { timeout: 1000 * 60 * 5 },
  );
  const prefix = `${options.sceneId}-f`;
  const frames = (await readdir(options.stillsDir))
    .filter((name) => name.startsWith(prefix) && name.endsWith('.jpg'))
    .sort();
  if (frames.length < 2) {
    throw new Error(`Clip for scene ${options.sceneId} produced ${frames.length} frames.`);
  }
  return frames.length;
}

/** Serves prefetched stills and clips over HTTP — Remotion only accepts http(s) asset URLs. */
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
        const contentType = mimeForExtension(path.extname(filePath));
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Accept-Ranges', 'bytes');

        const range = req.headers.range;
        if (range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(range);
          if (!match) {
            res.statusCode = 416;
            res.end();
            return;
          }
          const size = info.size;
          const start = match[1] ? Number.parseInt(match[1], 10) : 0;
          const end = match[2] ? Number.parseInt(match[2], 10) : size - 1;
          if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
            res.statusCode = 416;
            res.setHeader('Content-Range', `bytes */${size}`);
            res.end();
            return;
          }
          const chunkSize = end - start + 1;
          res.statusCode = 206;
          res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
          res.setHeader('Content-Length', chunkSize);
          createReadStream(filePath, { start, end }).pipe(res);
          return;
        }

        res.setHeader('Content-Length', info.size);
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
  options: { exportFps: number; width: number; height: number },
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
    const downloaded = await downloadSceneVideo(project, scene.id, scene.videoUrl, rawDest);
    if (!downloaded) {
      throw new Error(`Could not download animated clip for scene ${scene.id}.`);
    }
    const probed = await probeVideoDurationSeconds(rawDest);
    const clipDurationSeconds =
      probed ??
      scene.videoDurationSeconds ??
      project.scenes.find((s) => s.id === scene.id)?.video?.durationSeconds ??
      Math.max(0.1, scene.endTime - scene.startTime);
    const videoFrameCount = await extractClipFrames({
      inputPath: rawDest,
      stillsDir,
      sceneId: scene.id,
      exportFps: options.exportFps,
      width: options.width,
      height: options.height,
    });
    await unlink(rawDest).catch(() => undefined);
    prefetched += videoFrameCount;
    next = {
      ...next,
      videoUrl: scene.videoUrl,
      videoDurationSeconds: clipDurationSeconds,
      videoFramePrefix: `${assetsBaseUrl}/${scene.id}-f`,
      videoFrameCount,
    };
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
    width?: number;
    height?: number;
    onScene?: (info: { index: number; total: number; sceneId: string; hasVideo: boolean }) => void;
  },
): Promise<{ composition: CompositionProject; prefetched: number; total: number; videoScenes: number }> {
  await mkdir(stillsDir, { recursive: true });
  const base = projectToComposition(project);
  const exportFps = options?.exportFps ?? 15;
  const width = options?.width ?? 854;
  const height = options?.height ?? 480;
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
    const result = await prefetchSceneAssets(project, scene, stillsDir, assetsBaseUrl, {
      exportFps,
      width,
      height,
    });
    prefetched += result.prefetched;
    scenes.push(result.scene);
  }

  const videoScenes = scenes.filter((scene) => (scene.videoFrameCount ?? 0) > 1).length;
  const expectedVideos = base.scenes.filter((scene) => scene.videoUrl).length;
  if (expectedVideos > 0 && videoScenes === 0) {
    throw new Error('Export would be stills only: no scene clips could be prepared.');
  }

  return { composition: { ...base, scenes }, prefetched, total: base.scenes.length, videoScenes };
}

/** Shrink the rendered MP4 so it fits Supabase Storage's default 50 MB upload limit. */
export async function compressExportForUpload(inputPath: string, outputPath: string): Promise<void> {
  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-i',
      inputPath,
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      String(EXPORT_CRF),
      '-maxrate',
      EXPORT_MAX_VIDEO_BITRATE,
      '-bufsize',
      EXPORT_MAX_VIDEO_BUFSIZE,
      '-c:a',
      'aac',
      '-b:a',
      EXPORT_AUDIO_BITRATE,
      '-movflags',
      '+faststart',
      outputPath,
    ],
    { timeout: 1000 * 60 * 15 },
  );
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
