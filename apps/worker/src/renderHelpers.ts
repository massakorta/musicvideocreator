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

function mimeForExtension(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    default:
      return 'image/jpeg';
  }
}

async function loadSceneImageBody(
  project: MusicVideoProject,
  sceneId: string,
  imageUrl: string,
): Promise<Buffer | null> {
  const projectScene = project.scenes.find((s) => s.id === sceneId);
  const assetId = projectScene?.currentAssetId ?? projectScene?.image?.id;
  if (assetId) {
    const asset = await getRepositories().assets.get(assetId);
    if (asset) {
      const file = await getObjectStorage().get(asset.storagePath);
      if (file) return file.body;
    }
  }
  if (!imageUrl) return null;
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}

/** Serves prefetched stills over HTTP — headless Chromium blocks file:// image URLs. */
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
      const body = await loadSceneImageBody(project, scene.id, scene.imageUrl);
      if (!body) return scene;
      const ext = extensionFromUrl(scene.imageUrl);
      const filename = `${scene.id}${ext}`;
      const dest = path.join(stillsDir, filename);
      await writeFile(dest, body);
      prefetched += 1;
      return { ...scene, imageUrl: `${assetsBaseUrl}/${filename}` };
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
