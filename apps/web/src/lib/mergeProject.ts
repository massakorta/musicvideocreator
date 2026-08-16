import type { MusicVideoProject, StoryboardScene } from '@music-video/shared';

function sceneHasImage(scene: StoryboardScene): boolean {
  return Boolean(scene.currentAssetId || scene.image);
}

function mergeSceneFromServer(current: StoryboardScene, incoming: StoryboardScene): StoryboardScene {
  const currentHasImage = sceneHasImage(current);
  const incomingHasImage = sceneHasImage(incoming);

  if (currentHasImage && !incomingHasImage) {
    return {
      ...incoming,
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

  return incoming;
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
  return scenes.filter((scene) => !scene.approved && !scene.currentAssetId && !scene.image);
}
