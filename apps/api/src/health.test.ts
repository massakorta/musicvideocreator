import { describe, expect, it } from 'vitest';
import { coveragePercent, validateSceneTiming } from '@music-video/shared';
import type { StoryboardScene } from '@music-video/shared';

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

describe('timeline coverage', () => {
  it('is 100 when scenes cover the song', () => {
    const scenes = [scene('a', 0, 5), scene('b', 5, 10)];
    expect(coveragePercent(scenes, 10)).toBe(100);
    expect(validateSceneTiming(scenes, 10)).toHaveLength(0);
  });
});
