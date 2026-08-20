import { AppError, ERROR_CODES, resolveProjectImageQualityId, type CharacterDefinition } from '@music-video/shared';
import { characterReferenceFingerprint, errorText, sceneImageFingerprint } from '@music-video/shared';
import { config } from '../config.js';
import { placeholderSvg } from './demo.js';
import { createImageProvider, requireFalOrDemo } from './aiService.js';
import {
  attachAssetToScene,
  getProjectOrThrow,
  saveProject,
  storeGeneratedFile,
  styleOrThrow,
  updateProjectDocument,
} from './projects.js';
import {
  acquireSceneImageSlot,
  releaseSceneGeneration,
  releaseSceneImageSlot,
  tryAcquireSceneGeneration,
} from './sceneGenerationLock.js';
import { replaceScenes, touch } from './projectUtils.js';

export async function generateCharacterReference(projectId: string, characterId: string, force = false) {
  const project = await getProjectOrThrow(projectId);
  const character = project.visualBible?.characters.find((c) => c.id === characterId);
  if (!project.visualBible || !character) {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'That character is not in the visual bible.', 404);
  }
  if (character.lockedReferenceImage && !force) {
    throw new AppError(ERROR_CODES.CONFLICT, 'This character reference is locked. Unlock it before regenerating.', 409);
  }
  const style = styleOrThrow(project.styleId);
  const provider = createImageProvider(resolveProjectImageQualityId(project));
  let body: Buffer;
  let mimeType = 'image/svg+xml';
  let source: 'ai' | 'demo' = 'demo';

  if (provider && requireFalOrDemo() === 'live') {
    try {
      const image = await provider.generateCharacterReference({
        character,
        bible: project.visualBible,
        style,
      });
      body = image.bytes;
      mimeType = image.mimeType;
      source = 'ai';
    } catch (error) {
      throw new AppError(
        ERROR_CODES.IMAGE_FAILED,
        `The character reference for ${character.name} could not be generated. ${errorText(error)}`,
        502,
        error instanceof Error ? error.message : undefined,
      );
    }
  } else {
    body = placeholderSvg({
      title: character.name,
      subtitle: 'Character reference',
      accent: style.accent,
      secondary: style.secondary,
    });
  }

  const asset = await storeGeneratedFile({
    projectId,
    type: 'character_reference',
    source,
    filename: `${character.id}-ref${mimeType.includes('svg') ? '.svg' : '.png'}`,
    body,
    mimeType,
    width: 1920,
    height: 1080,
    metadata: { characterId },
  });

  await updateProjectDocument(projectId, (latest) => {
    if (!latest.visualBible) return latest;
    const characters = latest.visualBible.characters.map((c) =>
      c.id === characterId
        ? {
            ...c,
            referenceAssetId: asset.id,
            referenceUrl: asset.publicUrl,
            referenceFingerprint: characterReferenceFingerprint(
              { ...c, referenceAssetId: asset.id },
              latest.styleId,
              latest.visualBible!.masterPrompt,
              latest.visualBible!.overallStyle,
            ),
          }
        : c,
    );
    return {
      ...latest,
      visualBible: { ...latest.visualBible, characters },
    };
  });
  return { project: await getProjectOrThrow(projectId), asset, demo: source === 'demo' };
}

export async function approveCharacterReference(projectId: string, characterId: string, locked: boolean) {
  return updateProjectDocument(projectId, (latest) => {
    if (!latest.visualBible) {
      throw new AppError(ERROR_CODES.VALIDATION, 'Generate a visual bible first.', 400);
    }
    const characters = latest.visualBible.characters.map((c) =>
      c.id === characterId ? { ...c, lockedReferenceImage: locked } : c,
    );
    return { ...latest, visualBible: { ...latest.visualBible, characters } };
  });
}

export async function generateSceneImage(projectId: string, sceneId: string, force = false) {
  const project = await getProjectOrThrow(projectId);
  const scene = project.scenes.find((s) => s.id === sceneId);
  if (!scene) throw new AppError(ERROR_CODES.NOT_FOUND, 'That scene could not be found.', 404);
  if (!project.visualBible) {
    throw new AppError(ERROR_CODES.VALIDATION, 'Approve a visual bible first.', 400);
  }
  if (scene.currentAssetId && !force) {
    return { project, asset: scene.image, demo: scene.image?.source === 'demo', started: false };
  }
  if (!tryAcquireSceneGeneration(projectId, sceneId)) {
    throw new AppError(
      ERROR_CODES.CONFLICT,
      'This scene is already being generated. Wait a moment, then retry.',
      409,
    );
  }

  const style = styleOrThrow(project.styleId);
  const useLiveProvider = requireFalOrDemo() === 'live' && Boolean(createImageProvider(resolveProjectImageQualityId(project)));

  try {
    await updateProjectDocument(projectId, (latest) =>
      replaceScenes(
        latest,
        latest.scenes.map((s) =>
          s.id === sceneId ? { ...s, generationState: 'generating', generationError: undefined } : s,
        ),
      ),
    );

    if (useLiveProvider) {
      console.log(`[image] queued scene ${sceneId} on project ${projectId}`);
      void executeSceneImageGeneration(projectId, sceneId).catch((error) => {
        console.error(`[image] unhandled failure for ${projectId}/${sceneId}: ${errorText(error)}`);
      });
      return { project: await getProjectOrThrow(projectId), demo: false, started: true };
    }

    const body = placeholderSvg({
      title: scene.title,
      subtitle: `${formatTimecode(scene.startTime)} – ${formatTimecode(scene.endTime)}`,
      accent: style.accent,
      secondary: style.secondary,
    });
    const asset = await storeGeneratedFile({
      projectId,
      type: 'scene_image',
      source: 'demo',
      filename: `${scene.id}.svg`,
      body,
      mimeType: 'image/svg+xml',
      width: 1920,
      height: 1080,
      metadata: { sceneId },
    });
    let saved = await attachAssetToScene(await getProjectOrThrow(projectId), sceneId, asset);
    saved = await saveProject(
      touch(saved, { generatedImageQualityId: resolveProjectImageQualityId(saved) }),
    );
    return { project: saved, asset, demo: true, started: false };
  } catch (error) {
    if (useLiveProvider) releaseSceneGeneration(projectId, sceneId);
    throw error;
  } finally {
    if (!useLiveProvider) releaseSceneGeneration(projectId, sceneId);
  }
}

async function executeSceneImageGeneration(projectId: string, sceneId: string): Promise<void> {
  const startedAt = Date.now();
  let sceneOrder = 0;
  await acquireSceneImageSlot();
  try {
    const project = await getProjectOrThrow(projectId);
    const scene = project.scenes.find((s) => s.id === sceneId);
    if (!scene || !project.visualBible) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'That scene could not be found.', 404);
    }
    sceneOrder = scene.order;
    const style = styleOrThrow(project.styleId);
    const provider = createImageProvider(resolveProjectImageQualityId(project));
    if (!provider) {
      throw new AppError(ERROR_CODES.IMAGE_FAILED, 'Image generation requires fal.ai. Set FAL_KEY.', 502);
    }

    const refs = referenceUrls(project.visualBible.characters, scene.characters);
    const image = await provider.generateSceneImage({
      scene,
      bible: project.visualBible,
      style,
      referenceImages: refs,
    });

    const asset = await storeGeneratedFile({
      projectId,
      type: 'scene_image',
      source: 'ai',
      filename: `${scene.id}${image.mimeType.includes('svg') ? '.svg' : '.png'}`,
      body: image.bytes,
      mimeType: image.mimeType,
      width: 1920,
      height: 1080,
      metadata: { sceneId },
    });

    let saved = await attachAssetToScene(await getProjectOrThrow(projectId), sceneId, asset);
    const sceneAfter = saved.scenes.find((s) => s.id === sceneId);
    if (sceneAfter) {
      const fp = sceneImageFingerprint(sceneAfter, saved);
      saved = await updateProjectDocument(projectId, (latest) =>
        replaceScenes(
          latest,
          latest.scenes.map((s) => (s.id === sceneId ? { ...s, imageFingerprint: fp } : s)),
        ),
      );
      saved = await getProjectOrThrow(projectId);
    }

    await saveProject(touch(saved, { generatedImageQualityId: resolveProjectImageQualityId(saved) }));
    console.log(
      `[image] complete scene ${sceneId} on project ${projectId} in ${Math.round((Date.now() - startedAt) / 1000)}s`,
    );
  } catch (error) {
    const message = errorText(error);
    console.error(
      `[image] failed scene ${sceneId} on project ${projectId} after ${Math.round((Date.now() - startedAt) / 1000)}s: ${message}`,
    );
    await updateProjectDocument(projectId, (latest) =>
      replaceScenes(
        latest,
        latest.scenes.map((s) =>
          s.id === sceneId && s.generationState === 'generating'
            ? {
                ...s,
                generationState: 'failed',
                generationError:
                  error instanceof AppError
                    ? error.message
                    : `Scene ${sceneOrder || s.order} could not be generated. ${message}`,
              }
            : s,
        ),
      ),
    ).catch(() => undefined);
  } finally {
    releaseSceneGeneration(projectId, sceneId);
    releaseSceneImageSlot();
  }
}

export async function generateMissingImages(projectId: string) {
  const project = await getProjectOrThrow(projectId);
  const missing = project.scenes.filter((s) => !s.approved && !s.currentAssetId);
  const concurrency = Math.max(1, config.imageConcurrency);
  let cursor = 0;
  async function worker() {
    while (cursor < missing.length) {
      const index = cursor;
      cursor += 1;
      const scene = missing[index];
      if (!scene) return;
      await generateSceneImage(projectId, scene.id);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, missing.length) }, () => worker()));
  return getProjectOrThrow(projectId);
}

function referenceUrls(characters: CharacterDefinition[], ids: string[]) {
  return characters
    .filter((c) => ids.includes(c.id) && c.lockedReferenceImage && c.referenceUrl)
    .map((c) => ({ characterId: c.id, url: c.referenceUrl ?? '' }));
}

function formatTimecode(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
