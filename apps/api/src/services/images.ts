import { AppError, ERROR_CODES, resolveProjectImageQualityId, type CharacterDefinition } from '@music-video/shared';
import { characterReferenceFingerprint, errorText, sceneImageFingerprint } from '@music-video/shared';
import { config } from '../config.js';
import { placeholderSvg } from './demo.js';
import { createImageProvider, requireOpenAiOrDemo } from './aiService.js';
import {
  attachAssetToScene,
  getProjectOrThrow,
  saveProject,
  storeGeneratedFile,
  styleOrThrow,
  updateProjectDocument,
} from './projects.js';
import {
  releaseSceneGeneration,
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

  if (provider && requireOpenAiOrDemo() === 'live') {
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
    return { project, asset: scene.image, demo: scene.image?.source === 'demo' };
  }
  if (!tryAcquireSceneGeneration(projectId, sceneId)) {
    throw new AppError(
      ERROR_CODES.CONFLICT,
      'This scene is already being generated. Wait a moment, then retry.',
      409,
    );
  }

  const style = styleOrThrow(project.styleId);

  try {
    await updateProjectDocument(projectId, (latest) =>
      replaceScenes(
        latest,
        latest.scenes.map((s) =>
          s.id === sceneId ? { ...s, generationState: 'generating', generationError: undefined } : s,
        ),
      ),
    );

    const provider = createImageProvider(resolveProjectImageQualityId(project));
    let body: Buffer;
    let mimeType = 'image/svg+xml';
    let source: 'ai' | 'demo' = 'demo';
    if (provider && requireOpenAiOrDemo() === 'live') {
      const refs = referenceUrls(project.visualBible!.characters, scene.characters);
      const image = await provider.generateSceneImage({
        scene,
        bible: project.visualBible!,
        style,
        referenceImages: refs,
      });
      body = image.bytes;
      mimeType = image.mimeType;
      source = 'ai';
    } else {
      body = placeholderSvg({
        title: scene.title,
        subtitle: `${formatTimecode(scene.startTime)} – ${formatTimecode(scene.endTime)}`,
        accent: style.accent,
        secondary: style.secondary,
      });
    }

    const asset = await storeGeneratedFile({
      projectId,
      type: 'scene_image',
      source,
      filename: `${scene.id}${mimeType.includes('svg') ? '.svg' : '.png'}`,
      body,
      mimeType,
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

    saved = await saveProject(
      touch(saved, { generatedImageQualityId: resolveProjectImageQualityId(saved) }),
    );

    return { project: saved, asset, demo: source === 'demo' };
  } catch (error) {
    await updateProjectDocument(projectId, (latest) =>
      replaceScenes(
        latest,
        latest.scenes.map((s) =>
          s.id === sceneId && !s.currentAssetId
            ? {
                ...s,
                generationState: 'failed',
                generationError:
                  error instanceof AppError
                    ? error.message
                    : `Scene ${scene.order} could not be generated. The image provider returned an error.`,
              }
            : s,
        ),
      ),
    ).catch(() => undefined);

    if (error instanceof AppError) throw error;
    throw new AppError(
      ERROR_CODES.IMAGE_FAILED,
      `Scene ${scene.order} could not be generated. The image provider returned an error.`,
      502,
      error instanceof Error ? error.message : undefined,
    );
  } finally {
    releaseSceneGeneration(projectId, sceneId);
  }
}

export async function generateMissingImages(projectId: string) {
  const project = await getProjectOrThrow(projectId);
  const missing = project.scenes.filter((s) => !s.approved && !s.currentAssetId);
  const concurrency = Math.max(1, config.imageConcurrency);
  let cursor = 0;
  let latest = project;
  async function worker() {
    while (cursor < missing.length) {
      const index = cursor;
      cursor += 1;
      const scene = missing[index];
      if (!scene) return;
      const result = await generateSceneImage(projectId, scene.id);
      latest = result.project;
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
