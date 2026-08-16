import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
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

export async function prefetchCompositionStills(
  project: MusicVideoProject,
  workdir: string,
): Promise<{ composition: CompositionProject; prefetched: number; total: number }> {
  const imagesDir = path.join(workdir, 'stills');
  await mkdir(imagesDir, { recursive: true });
  const base = projectToComposition(project);
  let prefetched = 0;
  const scenes = await Promise.all(
    base.scenes.map(async (scene) => {
      const body = await loadSceneImageBody(project, scene.id, scene.imageUrl);
      if (!body) return scene;
      const ext = extensionFromUrl(scene.imageUrl);
      const dest = path.join(imagesDir, `${scene.id}${ext}`);
      await writeFile(dest, body);
      prefetched += 1;
      return { ...scene, imageUrl: pathToFileURL(dest).href };
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
