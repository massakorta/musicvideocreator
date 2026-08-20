import type { StoryboardScene } from './storyboard.js';

/** Clips use the shortest Kling duration for speed and cost. */
export const FIXED_SCENE_CLIP_DURATION_SECONDS = 5 as const;

export const VIDEO_GENERATION_EXPECTED_SECONDS = 45;

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

export function sceneClipDurationSeconds(_sceneDuration: number): typeof FIXED_SCENE_CLIP_DURATION_SECONDS {
  return FIXED_SCENE_CLIP_DURATION_SECONDS;
}

export function sceneVideoPlaybackRate(clipDurationSeconds: number, sceneDurationSeconds: number): number {
  if (sceneDurationSeconds <= 0) return 1;
  const raw = clipDurationSeconds / sceneDurationSeconds;
  return Math.min(1.25, Math.max(0.8, raw));
}
