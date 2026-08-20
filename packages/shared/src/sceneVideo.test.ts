import { describe, expect, it } from 'vitest';
import type { StoryboardScene } from './storyboard.js';
import {
  sceneClipDurationSeconds,
  sceneNeedsAnimation,
  sceneVideoPlaybackRate,
} from './sceneVideo.js';

function scene(partial: Partial<StoryboardScene>): StoryboardScene {
  return {
    id: 'a',
    order: 1,
    startTime: 0,
    endTime: 5,
    duration: 5,
    songSection: 'verse',
    title: 'Scene',
    description: 'desc',
    action: 'hold',
    characters: [],
    shotType: 'medium',
    cameraIntent: 'hold',
    imagePrompt: 'prompt',
    suggestedMotion: 'slowZoomIn',
    motion: 'slowZoomIn',
    transitionIn: 'cut',
    transitionOut: 'cut',
    mediaType: 'image',
    previousAssetIds: [],
    previousVideoAssetIds: [],
    generationState: 'complete',
    videoGenerationState: 'pending',
    approved: false,
    ...partial,
  };
}

describe('sceneClipDurationSeconds', () => {
  it('always uses the fast 5 second clip duration', () => {
    expect(sceneClipDurationSeconds(3)).toBe(5);
    expect(sceneClipDurationSeconds(7)).toBe(5);
    expect(sceneClipDurationSeconds(8)).toBe(5);
    expect(sceneClipDurationSeconds(12)).toBe(5);
  });
});

describe('sceneNeedsAnimation', () => {
  it('needs animation when a still exists without a clip', () => {
    expect(sceneNeedsAnimation(scene({ currentAssetId: 'img-1' }))).toBe(true);
    expect(
      sceneNeedsAnimation(scene({ currentAssetId: 'img-1', currentVideoAssetId: 'vid-1', mediaType: 'video' })),
    ).toBe(false);
  });
});

describe('sceneVideoPlaybackRate', () => {
  it('clamps playback rate between 0.8 and 1.25', () => {
    expect(sceneVideoPlaybackRate(5, 5)).toBe(1);
    expect(sceneVideoPlaybackRate(5, 10)).toBe(0.8);
    expect(sceneVideoPlaybackRate(10, 5)).toBe(1.25);
  });
});
