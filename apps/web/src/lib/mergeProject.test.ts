import { describe, expect, it } from 'vitest';
import type { StoryboardScene } from '@music-video/shared';
import { scenesMissingImages } from './mergeProject.js';

function scene(overrides: Partial<StoryboardScene> & Pick<StoryboardScene, 'id'>): StoryboardScene {
  return {
    id: overrides.id,
    order: overrides.order ?? 1,
    startTime: 0,
    endTime: 3,
    duration: 3,
    songSection: 'verse',
    title: overrides.title ?? 'Scene',
    description: 'Test',
    action: 'Test',
    characters: [],
    shotType: 'medium',
    cameraIntent: 'Hold',
    imagePrompt: 'Prompt',
    suggestedMotion: 'slowZoomIn',
    motion: 'slowZoomIn',
    transitionIn: 'cut',
    transitionOut: 'cut',
    mediaType: 'image',
    previousAssetIds: [],
    generationState: 'pending',
    approved: false,
    ...overrides,
  };
}

describe('scenesMissingImages', () => {
  it('includes orphaned generating scenes in the retry set', () => {
    const scenes = [
      scene({ id: 'a', generationState: 'generating' }),
      scene({ id: 'b', currentAssetId: 'asset-b', generationState: 'complete', approved: true }),
    ];
    expect(scenesMissingImages(scenes).map((s) => s.id)).toEqual(['a']);
  });
});
