import {
  AppError,
  ERROR_CODES,
  computeProjectHealth,
  computeEtaAt,
  createProjectBodySchema,
  DEFAULT_IMAGE_QUALITY_ID,
  getVisualStyle,
  patchProjectBodySchema,
  PIPELINE_STAGE_LABELS,
  pipelineProgressFromJob,
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
import { isSceneGenerationActive, isSceneVideoGenerationActive } from './sceneGenerationLock.js';

export async function listProjects(): Promise<ProjectSummary[]> {
  const projects = await getRepositories().projects.list();
  const summaries = await Promise.all(
    projects.map(async (project) => {
      const active = await getRepositories().pipelineJobs.getActiveByProject(project.id);
      if (!active) return toSummary(project);
      const progress = pipelineProgressFromJob(active);
      return {
        ...toSummary(project),
        status: 'generating_images' as const,
        pipelineActive: true,
        pipelineProgress: progress,
        pipelineStage: PIPELINE_STAGE_LABELS[active.stage],
        pipelineEtaAt: computeEtaAt(active.startedAt, active.expectedSeconds, progress),
      };
    }),
  );
  return summaries;
}

export async function getProjectOrThrow(id: string): Promise<MusicVideoProject> {
  const project = await getRepositories().projects.get(id);
  if (!project) {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'That project could not be found.', 404);
  }
  const repaired = await repairProjectDocument(project);
  return hydrateAssets(repaired);
}

export async function updateProjectDocument(
  projectId: string,
  mutator: (project: MusicVideoProject) => MusicVideoProject,
): Promise<MusicVideoProject> {
  return getRepositories().projects.updateDocument(projectId, mutator);
}

export async function createProject(input: unknown): Promise<MusicVideoProject> {
  const body = createProjectBodySchema.parse(input);
  const timestamp = nowIso();
  const project: MusicVideoProject = {
    id: newId(),
    name: body.name?.trim() || body.songTitle?.trim() || 'Untitled film',
    songTitle: body.songTitle?.trim() || body.name?.trim() || 'Untitled song',
    status: 'setup',
    imageQualityId: DEFAULT_IMAGE_QUALITY_ID,
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
    status: source.status === 'complete' || source.status === 'rendering' || source.status === 'ready_to_render' ? 'complete' : source.status,
    createdAt: timestamp,
    updatedAt: timestamp,
    audio: source.audio ? { ...source.audio, assetId: remap(source.audio.assetId) } : undefined,
    lyricAlignment: source.lyricAlignment
      ? { ...source.lyricAlignment, audioAssetId: remap(source.lyricAlignment.audioAssetId) }
      : undefined,
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
    previousVideoAssetIds: [],
    generationState: 'pending' as const,
    videoGenerationState: 'pending' as const,
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
  const attached = await updateProjectDocument(project.id, (latest) => {
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
    const scenes = latest.scenes.map((scene) => {
      if (scene.id !== sceneId) return scene;
      const previous = scene.currentAssetId
        ? [...new Set([...scene.previousAssetIds, scene.currentAssetId])]
        : scene.previousAssetIds;
      const previousVideos =
        scene.currentVideoAssetId && asset.type === 'scene_image'
          ? [...new Set([...scene.previousVideoAssetIds, scene.currentVideoAssetId])]
          : scene.previousVideoAssetIds;
      return {
        ...scene,
        image: generated,
        currentAssetId: asset.id,
        previousAssetIds: previous,
        generationState: 'complete' as const,
        generationError: undefined,
        ...(asset.type === 'scene_image'
          ? {
              video: undefined,
              currentVideoAssetId: undefined,
              previousVideoAssetIds: previousVideos,
              mediaType: 'image' as const,
              videoGenerationState: 'pending' as const,
              videoGenerationError: undefined,
            }
          : {}),
      };
    });
    return replaceScenes(latest, scenes);
  });
  return hydrateAssets(attached);
}

export async function attachVideoToScene(
  project: MusicVideoProject,
  sceneId: string,
  asset: AssetRecord,
): Promise<MusicVideoProject> {
  const attached = await updateProjectDocument(project.id, (latest) => {
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
    const scenes = latest.scenes.map((scene) => {
      if (scene.id !== sceneId) return scene;
      const previous = scene.currentVideoAssetId
        ? [...new Set([...scene.previousVideoAssetIds, scene.currentVideoAssetId])]
        : scene.previousVideoAssetIds;
      return {
        ...scene,
        video: generated,
        currentVideoAssetId: asset.id,
        previousVideoAssetIds: previous,
        mediaType: 'video' as const,
        videoGenerationState: 'complete' as const,
        videoGenerationError: undefined,
      };
    });
    return replaceScenes(latest, scenes);
  });
  return hydrateAssets(attached);
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

async function repairProjectDocument(project: MusicVideoProject): Promise<MusicVideoProject> {
  const assets = await getRepositories().assets.listByProject(project.id);
  const latestSceneAssets = new Map<string, AssetRecord>();
  const latestSceneVideos = new Map<string, AssetRecord>();
  for (const asset of assets) {
    if (asset.type === 'scene_image') {
      const sceneId = typeof asset.metadata?.sceneId === 'string' ? asset.metadata.sceneId : undefined;
      if (!sceneId) continue;
      const existing = latestSceneAssets.get(sceneId);
      if (!existing || asset.createdAt.localeCompare(existing.createdAt) > 0) {
        latestSceneAssets.set(sceneId, asset);
      }
      continue;
    }
    if (asset.type === 'scene_video') {
      const sceneId = typeof asset.metadata?.sceneId === 'string' ? asset.metadata.sceneId : undefined;
      if (!sceneId) continue;
      const existing = latestSceneVideos.get(sceneId);
      if (!existing || asset.createdAt.localeCompare(existing.createdAt) > 0) {
        latestSceneVideos.set(sceneId, asset);
      }
    }
  }

  let changed = false;
  for (const scene of project.scenes) {
    if (!scene.currentAssetId && latestSceneAssets.has(scene.id)) {
      changed = true;
      break;
    }
    if (!scene.currentVideoAssetId && latestSceneVideos.has(scene.id)) {
      changed = true;
      break;
    }
    if (
      scene.generationState === 'generating' &&
      !scene.currentAssetId &&
      !isSceneGenerationActive(project.id, scene.id)
    ) {
      changed = true;
      break;
    }
    if (
      scene.videoGenerationState === 'generating' &&
      !scene.currentVideoAssetId &&
      !isSceneVideoGenerationActive(project.id, scene.id)
    ) {
      changed = true;
      break;
    }
  }

  if (!changed) return project;
  return updateProjectDocument(project.id, (latest) => {
    const repairedScenes = latest.scenes.map((scene) => {
      let next = scene;

      if (!next.currentAssetId) {
        const asset = latestSceneAssets.get(scene.id);
        if (asset) {
          next = {
            ...next,
            currentAssetId: asset.id,
            generationState: 'complete' as const,
            generationError: undefined,
          };
        }
      }

      if (!next.currentVideoAssetId) {
        const asset = latestSceneVideos.get(scene.id);
        if (asset) {
          next = {
            ...next,
            currentVideoAssetId: asset.id,
            mediaType: 'video' as const,
            videoGenerationState: 'complete' as const,
            videoGenerationError: undefined,
          };
        }
      }

      if (
        next.generationState === 'generating' &&
        !next.currentAssetId &&
        !isSceneGenerationActive(project.id, scene.id)
      ) {
        next = {
          ...next,
          generationState: 'pending' as const,
          generationError: undefined,
        };
      }

      if (
        next.videoGenerationState === 'generating' &&
        !next.currentVideoAssetId &&
        !isSceneVideoGenerationActive(project.id, scene.id)
      ) {
        next = {
          ...next,
          videoGenerationState: 'pending' as const,
          videoGenerationError: undefined,
        };
      }

      return next;
    });
    return replaceScenes(latest, repairedScenes);
  });
}

async function hydrateAssets(project: MusicVideoProject): Promise<MusicVideoProject> {
  const assets = await getRepositories().assets.listByProject(project.id);
  const byId = new Map(assets.map((a) => [a.id, a]));
  const scenes = project.scenes.map((scene) => {
    const current = scene.currentAssetId ? byId.get(scene.currentAssetId) : undefined;
    const currentVideo = scene.currentVideoAssetId ? byId.get(scene.currentVideoAssetId) : undefined;
    let next = scene;
    if (current) {
      next = {
        ...next,
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
    }
    if (currentVideo) {
      next = {
        ...next,
        video: {
          id: currentVideo.id,
          projectId: currentVideo.projectId,
          type: currentVideo.type,
          source: currentVideo.source,
          storagePath: currentVideo.storagePath,
          publicUrl: currentVideo.publicUrl,
          mimeType: currentVideo.mimeType,
          width: currentVideo.width,
          height: currentVideo.height,
          durationSeconds: currentVideo.durationSeconds,
          fileSizeBytes: currentVideo.fileSizeBytes,
          metadata: currentVideo.metadata,
          createdAt: currentVideo.createdAt,
        },
      };
    }
    return next;
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

export async function storeGeneratedFileFromPath(options: {
  projectId: string;
  type: AssetRecord['type'];
  source: AssetRecord['source'];
  filename: string;
  filePath: string;
  mimeType: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  metadata?: Record<string, unknown>;
}): Promise<AssetRecord> {
  const stored = await getObjectStorage().putFromPath({
    projectId: options.projectId,
    filename: options.filename,
    filePath: options.filePath,
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
