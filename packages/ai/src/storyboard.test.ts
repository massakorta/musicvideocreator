import { describe, expect, it } from 'vitest';
import type { StoryboardScene } from '@music-video/shared';
import { normalizeStoryboardTiming } from './storyboard.js';

function scene(id: string, start: number, end: number): StoryboardScene {
  return {
    id,
    order: 1,
    startTime: start,
    endTime: end,
    duration: end - start,
    songSection: 'verse',
    title: id,
    description: 'd',
    action: 'a',
    characters: [],
    shotType: 'medium',
    cameraIntent: 'c',
    imagePrompt: 'p',
    suggestedMotion: 'slowZoomIn',
    motion: 'slowZoomIn',
    transitionIn: 'cut',
    transitionOut: 'cut',
    mediaType: 'image',
    previousAssetIds: [],
    previousVideoAssetIds: [],
    generationState: 'pending',
    videoGenerationState: 'pending',
    approved: false,
  };
}

describe('normalizeStoryboardTiming', () => {
  it('closes gaps and clamps to duration', () => {
    const result = normalizeStoryboardTiming(
      [scene('a', 0.4, 3), scene('b', 4, 9)],
      10,
    );
    expect(result[0]?.startTime).toBe(0);
    expect(result[0]?.endTime).toBe(result[1]?.startTime);
    expect(result[result.length - 1]?.endTime).toBe(10);
  });
});
