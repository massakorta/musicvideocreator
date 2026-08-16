import { AppError, ERROR_CODES, type CharacterDefinition } from '@music-video/shared';
import { config } from '../config.js';
import { placeholderSvg } from './demo.js';
import { createImageProvider, requireOpenAiOrDemo } from './aiService.js';
import {
  attachAssetToScene,
  getProjectOrThrow,
  saveProject,
  storeGeneratedFile,
  styleOrThrow,
} from './projects.js';

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
  const provider = createImageProvider();
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
        `The character reference for ${character.name} could not be generated.`,
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

  const characters = project.visualBible.characters.map((c) =>
    c.id === characterId ? { ...c, referenceAssetId: asset.id, referenceUrl: asset.publicUrl } : c,
  );
  await saveProject({
    ...project,
    visualBible: { ...project.visualBible, characters },
  });
  return { project: await getProjectOrThrow(projectId), asset, demo: source === 'demo' };
}

export async function approveCharacterReference(projectId: string, characterId: string, locked: boolean) {
  const project = await getProjectOrThrow(projectId);
  if (!project.visualBible) {
    throw new AppError(ERROR_CODES.VALIDATION, 'Generate a visual bible first.', 400);
  }
  const characters = project.visualBible.characters.map((c) =>
    c.id === characterId ? { ...c, lockedReferenceImage: locked } : c,
  );
  return saveProject({ ...project, visualBible: { ...project.visualBible, characters } });
}

export async function generateSceneImage(projectId: string, sceneId: string) {
  const project = await getProjectOrThrow(projectId);
  const scene = project.scenes.find((s) => s.id === sceneId);
  if (!scene) throw new AppError(ERROR_CODES.NOT_FOUND, 'That scene could not be found.', 404);
  if (!project.visualBible) {
    throw new AppError(ERROR_CODES.VALIDATION, 'Approve a visual bible first.', 400);
  }
  const style = styleOrThrow(project.styleId);
  const generating = await saveProject({
    ...project,
    scenes: project.scenes.map((s) =>
      s.id === sceneId ? { ...s, generationState: 'generating', generationError: undefined } : s,
    ),
  });

  try {
    const provider = createImageProvider();
    let body: Buffer;
    let mimeType = 'image/svg+xml';
    let source: 'ai' | 'demo' = 'demo';
    if (provider && requireOpenAiOrDemo() === 'live') {
      const refs = referenceUrls(generating.visualBible!.characters, scene.characters);
      const image = await provider.generateSceneImage({
        scene,
        bible: generating.visualBible!,
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
    const latest = await getProjectOrThrow(projectId);
    const saved = await attachAssetToScene(latest, sceneId, asset);
    return { project: saved, asset, demo: source === 'demo' };
  } catch (error) {
    const latest = await getProjectOrThrow(projectId).catch(() => generating);
    await saveProject({
      ...latest,
      scenes: latest.scenes.map((s) =>
        s.id === sceneId
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
    });
    if (error instanceof AppError) throw error;
    throw new AppError(
      ERROR_CODES.IMAGE_FAILED,
      `Scene ${scene.order} could not be generated. The image provider returned an error.`,
      502,
    );
  }
}

export async function generateMissingImages(projectId: string) {
  const project = await getProjectOrThrow(projectId);
  const missing = project.scenes.filter((s) => !s.approved && !s.currentAssetId && s.generationState !== 'generating');
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
  return latest;
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
