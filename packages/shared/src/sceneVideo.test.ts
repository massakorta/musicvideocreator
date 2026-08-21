import { describe, expect, it } from 'vitest';
import type { StoryboardScene } from './storyboard.js';
import {
  sceneClipDurationSeconds,
  sceneNeedsAnimation,
  sceneVideoFrameUrl,
  sceneVideoPingPongSeconds,
  sceneVideoPlaybackRate,
  sceneVideoSourceFrameIndex,
  sceneVideoSourceSeconds,
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

describe('sceneVideoPingPongSeconds', () => {
  it('plays forward then backward across a longer scene slot', () => {
    expect(sceneVideoPingPongSeconds(0, 5)).toBe(0);
    expect(sceneVideoPingPongSeconds(3, 5)).toBe(3);
    expect(sceneVideoPingPongSeconds(5, 5)).toBe(5);
    expect(sceneVideoPingPongSeconds(6, 5)).toBe(4);
    expect(sceneVideoPingPongSeconds(8, 5)).toBe(2);
    expect(sceneVideoPingPongSeconds(10, 5)).toBe(0);
  });
});

describe('sceneVideoSourceSeconds', () => {
  it('speeds up when the clip is longer than the scene', () => {
    expect(sceneVideoSourceSeconds(2.5, 10, 5)).toBe(5);
  });

  it('ping-pongs when the clip is shorter than the scene', () => {
    expect(sceneVideoSourceSeconds(6, 5, 8)).toBe(4);
  });
});

describe('sceneVideoSourceFrameIndex', () => {
  it('maps scene time onto extracted clip frames with ping-pong', () => {
    expect(sceneVideoSourceFrameIndex(0, 5, 8, 75)).toBe(0);
    expect(sceneVideoSourceFrameIndex(2.5, 5, 8, 75)).toBe(37);
    expect(sceneVideoSourceFrameIndex(5, 5, 8, 75)).toBe(74);
    expect(sceneVideoSourceFrameIndex(6, 5, 8, 75)).toBe(60);
  });
});

describe('sceneVideoFrameUrl', () => {
  it('uses 1-based ffmpeg frame numbers', () => {
    expect(sceneVideoFrameUrl('http://127.0.0.1/scene-f', 0)).toBe('http://127.0.0.1/scene-f0001.jpg');
    expect(sceneVideoFrameUrl('http://127.0.0.1/scene-f', 74)).toBe('http://127.0.0.1/scene-f0075.jpg');
  });
});

describe('sceneVideoPlaybackRate', () => {
  it('clamps playback rate between 0.8 and 1.25', () => {
    expect(sceneVideoPlaybackRate(5, 5)).toBe(1);
    expect(sceneVideoPlaybackRate(5, 10)).toBe(0.8);
    expect(sceneVideoPlaybackRate(10, 5)).toBe(1.25);
  });
});
