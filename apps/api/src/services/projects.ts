import {
  AppError,
  ERROR_CODES,
  computeProjectHealth,
  createProjectBodySchema,
  getVisualStyle,
  patchProjectBodySchema,
  type AssetRecord,
  type GeneratedAsset,
  type MusicVideoProject,
  type ProjectSummary,
  type RenderJob,
  type ScenePatch,
} from '@music-video/shared';
import { getRepositories } from '../repositories/index.js';
import { getObjectStorage } from '../storage/index.js';
import { applyScenePatch, deriveStatus, newId, nowIso, replaceScenes, toSummary, touch } from './projectUtils.js';

export async function listProjects(): Promise<ProjectSummary[]> {
  const projects = await getRepositories().projects.list();
  return projects.map(toSummary);
}

export async function getProjectOrThrow(id: string): Promise<MusicVideoProject> {
  const project = await getRepositories().projects.get(id);
  if (!project) {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'That project could not be found.', 404);
  }
  return hydrateAssets(project);
}

export async function createProject(input: unknown): Promise<MusicVideoProject> {
  const body = createProjectBodySchema.parse(input);
  const timestamp = nowIso();
  const project: MusicVideoProject = {
    id: newId(),
    name: body.name,
    songTitle: body.songTitle?.trim() || body.name,
    status: 'setup',
    durationSeconds: 0,
    lyrics: body.lyrics ?? '',
    visualBibleApproved: false,
    scenes: [],
    formatId: '16x9',
    captionsEnabled: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return getRepositories().projects.save(project);
}

export async function patchProject(id: string, input: unknown): Promise<MusicVideoProject> {
  const body = patchProjectBodySchema.parse(input);
  const project = await getProjectOrThrow(id);
  const next = touch(project, {
    ...body,
    songTitle: body.songTitle ?? project.songTitle,
  });
  next.status = deriveStatus(next);
  return getRepositories().projects.save(next);
}

export async function deleteProject(id: string): Promise<void> {
  await getProjectOrThrow(id);
  await getRepositories().projects.delete(id);
}

export async function duplicateProject(id: string): Promise<MusicVideoProject> {
  const source = await getProjectOrThrow(id);
  const newProjectId = newId();
  const timestamp = nowIso();
  const storage = getObjectStorage();
  const assets = await getRepositories().assets.listByProject(id);
  const idMap = new Map<string, string>();

  for (const asset of assets) {
    const newAssetId = newId();
    idMap.set(asset.id, newAssetId);
    let storagePath = asset.storagePath;
    let publicUrl = asset.publicUrl;
    let fileSizeBytes = asset.fileSizeBytes;
    try {
      const file = await storage.get(asset.storagePath);
      if (file) {
        const extension = asset.storagePath.split('.').pop() || 'bin';
        const stored = await storage.put({
          projectId: newProjectId,
          filename: `${newAssetId}.${extension}`,
          body: file.body,
          mimeType: file.mimeType || asset.mimeType,
        });
        storagePath = stored.storagePath;
        publicUrl = stored.publicUrl;
        fileSizeBytes = stored.bytes;
      }
    } catch {
      // Keep the original public URL if the bytes cannot be copied.
    }
    await getRepositories().assets.save({
      ...asset,
      id: newAssetId,
      projectId: newProjectId,
      storagePath,
      publicUrl,
      fileSizeBytes,
      createdAt: timestamp,
    });
  }

  const remap = (assetId?: string) => (assetId ? (idMap.get(assetId) ?? assetId) : assetId);
  const copy: MusicVideoProject = {
    ...structuredClone(source),
    id: newProjectId,
    name: `${source.name} copy`,
    status: source.status === 'complete' || source.status === 'rendering' ? 'ready_to_render' : source.status,
    createdAt: timestamp,
    updatedAt: timestamp,
    audio: source.audio ? { ...source.audio, assetId: remap(source.audio.assetId) } : undefined,
    visualBible: source.visualBible
      ? {
          ...structuredClone(source.visualBible),
          characters: source.visualBible.characters.map((character) => ({
            ...character,
            referenceAssetId: remap(character.referenceAssetId),
          })),
        }
      : undefined,
    scenes: source.scenes.map((scene) => ({
      ...structuredClone(scene),
      currentAssetId: remap(scene.currentAssetId),
      previousAssetIds: scene.previousAssetIds.map((assetId) => remap(assetId) ?? assetId),
    })),
  };
  copy.status = deriveStatus(copy);
  await getRepositories().projects.save(copy);
  return getProjectOrThrow(newProjectId);
}

export async function saveProject(project: MusicVideoProject): Promise<MusicVideoProject> {
  project.status = deriveStatus(project);
  project.updatedAt = nowIso();
  project.thumbnailUrl =
    project.scenes.find((scene) => scene.image?.publicUrl)?.image?.publicUrl ?? project.thumbnailUrl;
  return getRepositories().projects.save(project);
}

export async function updateScene(projectId: string, sceneId: string, patch: ScenePatch): Promise<MusicVideoProject> {
  const project = await getProjectOrThrow(projectId);
  const scenes = project.scenes.map((scene) => (scene.id === sceneId ? applyScenePatch(scene, patch) : scene));
  return saveProject(replaceScenes(project, scenes));
}

export async function addScene(projectId: string, afterSceneId?: string): Promise<MusicVideoProject> {
  const project = await getProjectOrThrow(projectId);
  const after = afterSceneId ? project.scenes.find((s) => s.id === afterSceneId) : project.scenes.at(-1);
  const start = after?.endTime ?? 0;
  const remaining = (project.durationSeconds || start + 3) - start;
  const length = remaining > 0.4 ? Math.min(3, remaining) : 3;
  const end = start + length;
  const scene = {
    id: newId(),
    order: (after?.order ?? 0) + 1,
    startTime: start,
    endTime: end,
    duration: end - start,
    songSection: after?.songSection ?? ('other' as const),
    title: 'New scene',
    description: 'A single frozen moment.',
    action: 'Hold the pose.',
    characters: after?.characters ?? [],
    environmentId: after?.environmentId,
    shotType: after?.shotType ?? ('medium' as const),
    cameraIntent: 'Gentle push',
    imagePrompt: 'Cinematic still with breathing room',
    suggestedMotion: after?.motion ?? ('slowZoomIn' as const),
    motion: after?.motion ?? ('slowZoomIn' as const),
    transitionIn: 'cut' as const,
    transitionOut: 'cut' as const,
    mediaType: 'image' as const,
    previousAssetIds: [],
    generationState: 'pending' as const,
    approved: false,
  };
  const scenes = [...project.scenes];
  const idx = after ? scenes.findIndex((s) => s.id === after.id) + 1 : scenes.length;
  scenes.splice(idx, 0, scene);
  return saveProject(replaceScenes(project, scenes));
}

export async function deleteScene(projectId: string, sceneId: string): Promise<MusicVideoProject> {
  const project = await getProjectOrThrow(projectId);
  return saveProject(replaceScenes(project, project.scenes.filter((s) => s.id !== sceneId)));
}

export async function duplicateScene(projectId: string, sceneId: string): Promise<MusicVideoProject> {
  const project = await getProjectOrThrow(projectId);
  const scene = project.scenes.find((s) => s.id === sceneId);
  if (!scene) throw new AppError(ERROR_CODES.NOT_FOUND, 'That scene could not be found.', 404);
  const copy = { ...structuredClone(scene), id: newId(), title: `${scene.title} copy`, approved: false };
  const scenes = [...project.scenes];
  scenes.splice(scene.order, 0, copy);
  return saveProject(replaceScenes(project, scenes));
}

export async function reorderScenes(projectId: string, sceneIds: string[]): Promise<MusicVideoProject> {
  const project = await getProjectOrThrow(projectId);
  const map = new Map(project.scenes.map((s) => [s.id, s]));
  const ordered = sceneIds.map((id) => map.get(id)).filter(Boolean) as typeof project.scenes;
  if (ordered.length !== project.scenes.length) {
    throw new AppError(ERROR_CODES.VALIDATION, 'Scene list is incomplete.', 400);
  }
  return saveProject(replaceScenes(project, ordered));
}

export async function attachAssetToScene(
  project: MusicVideoProject,
  sceneId: string,
  asset: AssetRecord,
): Promise<MusicVideoProject> {
  const generated: GeneratedAsset = {
    id: asset.id,
    projectId: asset.projectId,
    type: asset.type,
    source: asset.source,
    storagePath: asset.storagePath,
    publicUrl: asset.publicUrl,
    mimeType: asset.mimeType,
    width: asset.width,
    height: asset.height,
    durationSeconds: asset.durationSeconds,
    fileSizeBytes: asset.fileSizeBytes,
    metadata: asset.metadata,
    createdAt: asset.createdAt,
  };
  const scenes = project.scenes.map((scene) => {
    if (scene.id !== sceneId) return scene;
    const previous = scene.currentAssetId
      ? [...new Set([...scene.previousAssetIds, scene.currentAssetId])]
      : scene.previousAssetIds;
    return {
      ...scene,
      image: generated,
      currentAssetId: asset.id,
      previousAssetIds: previous,
      generationState: 'complete' as const,
      generationError: undefined,
    };
  });
  return saveProject(replaceScenes(project, scenes));
}

export async function restoreSceneAsset(projectId: string, sceneId: string, assetId: string): Promise<MusicVideoProject> {
  const project = await getProjectOrThrow(projectId);
  const asset = await getRepositories().assets.get(assetId);
  if (!asset || asset.projectId !== projectId) {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'That image version could not be found.', 404);
  }
  return attachAssetToScene(project, sceneId, asset);
}

export function styleOrThrow(styleId: string | undefined) {
  if (!styleId) {
    throw new AppError(ERROR_CODES.VALIDATION, 'Choose a visual style first.', 400);
  }
  return getVisualStyle(styleId);
}

export { computeProjectHealth };

async function hydrateAssets(project: MusicVideoProject): Promise<MusicVideoProject> {
  const assets = await getRepositories().assets.listByProject(project.id);
  const byId = new Map(assets.map((a) => [a.id, a]));
  const scenes = project.scenes.map((scene) => {
    const current = scene.currentAssetId ? byId.get(scene.currentAssetId) : undefined;
    if (!current) return scene;
    return {
      ...scene,
      image: {
        id: current.id,
        projectId: current.projectId,
        type: current.type,
        source: current.source,
        storagePath: current.storagePath,
        publicUrl: current.publicUrl,
        mimeType: current.mimeType,
        width: current.width,
        height: current.height,
        durationSeconds: current.durationSeconds,
        fileSizeBytes: current.fileSizeBytes,
        metadata: current.metadata,
        createdAt: current.createdAt,
      },
    };
  });
  if (project.visualBible) {
    project.visualBible.characters = project.visualBible.characters.map((character) => {
      if (!character.referenceAssetId) return character;
      const asset = byId.get(character.referenceAssetId);
      return asset ? { ...character, referenceUrl: asset.publicUrl } : character;
    });
  }
  if (project.audio?.assetId) {
    const audio = byId.get(project.audio.assetId);
    if (audio) {
      project.audio = {
        ...project.audio,
        url: audio.publicUrl,
      };
    }
  }
  return { ...project, scenes };
}

export async function storeGeneratedFile(options: {
  projectId: string;
  type: AssetRecord['type'];
  source: AssetRecord['source'];
  filename: string;
  body: Buffer;
  mimeType: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  metadata?: Record<string, unknown>;
}): Promise<AssetRecord> {
  const stored = await getObjectStorage().put({
    projectId: options.projectId,
    filename: options.filename,
    body: options.body,
    mimeType: options.mimeType,
  });
  const asset: AssetRecord = {
    id: newId(),
    projectId: options.projectId,
    type: options.type,
    source: options.source,
    storagePath: stored.storagePath,
    publicUrl: stored.publicUrl,
    mimeType: options.mimeType,
    width: options.width,
    height: options.height,
    durationSeconds: options.durationSeconds,
    fileSizeBytes: stored.bytes,
    metadata: options.metadata,
    createdAt: nowIso(),
  };
  await getRepositories().assets.save(asset);
  return asset;
}

export type { RenderJob };
