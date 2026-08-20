import type { MusicVideoProject, StoryboardScene } from '@music-video/shared';
import { sceneHasStill, sceneHasVideo } from '@music-video/shared';

function mergeSceneFromServer(current: StoryboardScene, incoming: StoryboardScene): StoryboardScene {
  let merged = incoming;

  if (sceneHasStill(current) && !sceneHasStill(incoming)) {
    merged = {
      ...merged,
      currentAssetId: current.currentAssetId ?? incoming.currentAssetId,
      image: current.image ?? incoming.image,
      previousAssetIds:
        current.previousAssetIds.length >= incoming.previousAssetIds.length
          ? current.previousAssetIds
          : incoming.previousAssetIds,
      generationState: current.generationState === 'complete' ? 'complete' : incoming.generationState,
      generationError: current.generationState === 'complete' ? undefined : incoming.generationError,
    };
  }

  if (
    incoming.generationState === 'generating' ||
    (current.generationState === 'generating' &&
      incoming.generationState === 'complete' &&
      sceneHasStill(incoming) &&
      sceneHasStill(current) &&
      current.currentAssetId === incoming.currentAssetId)
  ) {
    merged = {
      ...merged,
      generationState: 'generating',
      generationError: undefined,
    };
  }

  if (
    incoming.generationState === 'failed' &&
    incoming.generationError &&
    (!merged.generationError || merged.generationState !== 'failed')
  ) {
    merged = {
      ...merged,
      generationState: 'failed',
      generationError: incoming.generationError,
    };
  }

  if (sceneHasVideo(current) && !sceneHasVideo(incoming)) {
    merged = {
      ...merged,
      currentVideoAssetId: current.currentVideoAssetId ?? incoming.currentVideoAssetId,
      video: current.video ?? incoming.video,
      previousVideoAssetIds:
        current.previousVideoAssetIds.length >= incoming.previousVideoAssetIds.length
          ? current.previousVideoAssetIds
          : incoming.previousVideoAssetIds,
      mediaType: current.mediaType === 'video' ? 'video' : merged.mediaType,
      videoGenerationState:
        current.videoGenerationState === 'complete' ? 'complete' : incoming.videoGenerationState,
      videoGenerationError:
        current.videoGenerationState === 'complete' ? undefined : incoming.videoGenerationError,
    };
  }

  if (
    incoming.videoGenerationState === 'generating' ||
    (current.videoGenerationState === 'generating' &&
      incoming.videoGenerationState === 'complete' &&
      sceneHasVideo(current) &&
      sceneHasVideo(incoming) &&
      current.currentVideoAssetId === incoming.currentVideoAssetId)
  ) {
    merged = {
      ...merged,
      videoGenerationState: 'generating',
      videoGenerationError: undefined,
    };
  }

  if (
    incoming.videoGenerationState === 'failed' &&
    incoming.videoGenerationError &&
    (!merged.videoGenerationError || merged.videoGenerationState !== 'failed')
  ) {
    merged = {
      ...merged,
      videoGenerationState: 'failed',
      videoGenerationError: incoming.videoGenerationError,
    };
  }

  return merged;
}

/** Keep locally completed stills when a stale API response arrives during batch generation. */
export function mergeProjectFromServer(current: MusicVideoProject, incoming: MusicVideoProject): MusicVideoProject {
  const currentById = new Map(current.scenes.map((scene) => [scene.id, scene]));
  const mergedScenes = incoming.scenes.map((scene) => {
    const previous = currentById.get(scene.id);
    return previous ? mergeSceneFromServer(previous, scene) : scene;
  });
  return { ...incoming, scenes: mergedScenes };
}

export function scenesMissingImages(scenes: StoryboardScene[]): StoryboardScene[] {
  return scenes.filter((scene) => !scene.approved && !sceneHasStill(scene));
}

export function scenesNeedingAnimation(scenes: StoryboardScene[]): StoryboardScene[] {
  return scenes.filter((scene) => sceneHasStill(scene) && !sceneHasVideo(scene));
}
