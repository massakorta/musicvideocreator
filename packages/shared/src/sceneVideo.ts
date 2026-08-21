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

/** Maps scene timeline position to a position inside the source clip (ping-pong when clip is shorter than the scene). */
export function sceneVideoPingPongSeconds(localSeconds: number, clipDurationSeconds: number): number {
  if (clipDurationSeconds <= 0 || localSeconds <= 0) return 0;
  const cycle = clipDurationSeconds * 2;
  const position = localSeconds % cycle;
  if (position <= clipDurationSeconds) return position;
  return cycle - position;
}

/** Source timestamp for the clip at a point in the scene timeline. */
export function sceneVideoSourceSeconds(
  localSeconds: number,
  clipDurationSeconds: number,
  sceneDurationSeconds: number,
): number {
  if (clipDurationSeconds <= 0 || localSeconds <= 0) return 0;
  if (sceneDurationSeconds <= 0) return 0;
  if (clipDurationSeconds >= sceneDurationSeconds) {
    const rate = clipDurationSeconds / sceneDurationSeconds;
    return Math.min(localSeconds * rate, Math.max(0, clipDurationSeconds - 0.001));
  }
  return sceneVideoPingPongSeconds(localSeconds, clipDurationSeconds);
}

/** Zero-based frame inside an extracted clip sequence for the current scene time. */
export function sceneVideoSourceFrameIndex(
  localSeconds: number,
  clipDurationSeconds: number,
  sceneDurationSeconds: number,
  frameCount: number,
): number {
  if (frameCount <= 1) return 0;
  if (clipDurationSeconds <= 0) return 0;
  const sourceTime = sceneVideoSourceSeconds(localSeconds, clipDurationSeconds, sceneDurationSeconds);
  const ratio = Math.min(1, Math.max(0, sourceTime / clipDurationSeconds));
  if (ratio >= 1) return frameCount - 1;
  return Math.min(frameCount - 1, Math.floor(ratio * frameCount));
}

export function sceneVideoFrameUrl(prefix: string, index: number, pad = 4): string {
  return `${prefix}${String(index + 1).padStart(pad, '0')}.jpg`;
}

/** @deprecated Prefer sceneVideoSourceSeconds; kept for tests and legacy callers. */
export function sceneVideoPlaybackRate(clipDurationSeconds: number, sceneDurationSeconds: number): number {
  if (sceneDurationSeconds <= 0) return 1;
  const raw = clipDurationSeconds / sceneDurationSeconds;
  return Math.min(1.25, Math.max(0.8, raw));
}
