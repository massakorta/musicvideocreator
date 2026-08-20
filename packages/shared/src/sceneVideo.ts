import type { StoryboardScene } from './storyboard.js';

export const VIDEO_GENERATION_EXPECTED_SECONDS = 60;

export function sceneHasStill(scene: Pick<StoryboardScene, 'currentAssetId' | 'image'>): boolean {
  return Boolean(scene.currentAssetId || scene.image);
}

export function sceneHasVideo(
  scene: Pick<StoryboardScene, 'currentVideoAssetId' | 'video'>,
): boolean {
  return Boolean(scene.currentVideoAssetId || scene.video);
}

export function sceneNeedsAnimation(scene: StoryboardScene): boolean {
  return sceneHasStill(scene) && !sceneHasVideo(scene);
}

export function sceneClipDurationSeconds(sceneDuration: number): 5 | 10 {
  return sceneDuration <= 7 ? 5 : 10;
}

export function sceneVideoPlaybackRate(clipDurationSeconds: number, sceneDurationSeconds: number): number {
  if (sceneDurationSeconds <= 0) return 1;
  const raw = clipDurationSeconds / sceneDurationSeconds;
  return Math.min(1.25, Math.max(0.8, raw));
}
