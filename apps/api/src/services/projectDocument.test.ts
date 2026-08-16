import { describe, expect, it } from 'vitest';
import type { StoryboardScene } from '@music-video/shared';
import { mergeProjectDocuments, mergeSceneState } from './projectUtils.js';

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

describe('mergeSceneState', () => {
  it('keeps a completed still when a stale write drops the asset', () => {
    const previous = scene({
      id: 'a',
      currentAssetId: 'asset-a',
      generationState: 'complete',
    });
    const incoming = scene({
      id: 'a',
      generationState: 'generating',
    });

    const merged = mergeSceneState(previous, incoming);
    expect(merged.currentAssetId).toBe('asset-a');
    expect(merged.generationState).toBe('complete');
  });

  it('preserves both completed stills when two scenes finish concurrently', () => {
    const currentScenes = [
      scene({ id: 'a', currentAssetId: 'asset-a', generationState: 'complete' }),
      scene({ id: 'b', generationState: 'generating' }),
    ];
    const incomingScenes = [
      scene({ id: 'a', generationState: 'generating' }),
      scene({ id: 'b', currentAssetId: 'asset-b', generationState: 'complete' }),
    ];

    const merged = mergeProjectDocuments(
      { scenes: currentScenes } as never,
      { scenes: incomingScenes } as never,
    );

    expect(merged.scenes.find((s) => s.id === 'a')?.currentAssetId).toBe('asset-a');
    expect(merged.scenes.find((s) => s.id === 'b')?.currentAssetId).toBe('asset-b');
  });
});
