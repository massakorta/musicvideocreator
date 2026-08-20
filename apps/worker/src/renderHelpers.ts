import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { projectToComposition, type CompositionProject } from '@music-video/video';
import type { MusicVideoProject } from '@music-video/shared';
import { getRepositories } from '../../api/src/repositories/index.js';
import { getObjectStorage } from '../../api/src/storage/index.js';

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

async function loadSceneImageBody(
  project: MusicVideoProject,
  sceneId: string,
  imageUrl: string,
): Promise<{ body: Buffer; mimeType: string } | null> {
  const projectScene = project.scenes.find((s) => s.id === sceneId);
  const assetId = projectScene?.currentAssetId ?? projectScene?.image?.id;
  if (assetId) {
    const asset = await getRepositories().assets.get(assetId);
    if (asset) {
      const file = await getObjectStorage().get(asset.storagePath);
      if (file) {
        return { body: file.body, mimeType: asset.mimeType || file.mimeType };
      }
    }
  }
  if (!imageUrl) return null;
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return null;
    const body = Buffer.from(await response.arrayBuffer());
    const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg';
    return { body, mimeType };
  } catch {
    return null;
  }
}

async function loadSceneVideoBody(
  project: MusicVideoProject,
  sceneId: string,
  videoUrl: string,
): Promise<Buffer | null> {
  const projectScene = project.scenes.find((s) => s.id === sceneId);
  const assetId = projectScene?.currentVideoAssetId ?? projectScene?.video?.id;
  if (assetId) {
    const asset = await getRepositories().assets.get(assetId);
    if (asset) {
      const file = await getObjectStorage().get(asset.storagePath);
      if (file) return file.body;
    }
  }
  if (!videoUrl) return null;
  try {
    const response = await fetch(videoUrl);
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
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

export async function prefetchCompositionStills(
  project: MusicVideoProject,
  stillsDir: string,
  assetsBaseUrl: string,
): Promise<{ composition: CompositionProject; prefetched: number; total: number }> {
  await mkdir(stillsDir, { recursive: true });
  const base = projectToComposition(project);
  let prefetched = 0;
  const scenes = await Promise.all(
    base.scenes.map(async (scene) => {
      let next = scene;
      const image = await loadSceneImageBody(project, scene.id, scene.imageUrl);
      if (image) {
        const ext = extensionFromMime(image.mimeType) || extensionFromUrl(scene.imageUrl);
        const filename = `${scene.id}${ext}`;
        const dest = path.join(stillsDir, filename);
        await writeFile(dest, image.body);
        prefetched += 1;
        next = { ...next, imageUrl: `${assetsBaseUrl}/${filename}` };
      }
      if (scene.videoUrl) {
        const videoBody = await loadSceneVideoBody(project, scene.id, scene.videoUrl);
        if (videoBody) {
          const filename = `${scene.id}-clip.mp4`;
          const dest = path.join(stillsDir, filename);
          await writeFile(dest, videoBody);
          prefetched += 1;
          next = { ...next, videoUrl: `${assetsBaseUrl}/${filename}` };
        }
      }
      return next;
    }),
  );
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
