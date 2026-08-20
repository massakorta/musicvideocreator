import { describe, expect, it } from 'vitest';
import type { MusicVideoProject, StoryboardScene } from '@music-video/shared';
import { mergeProjectFromServer, scenesMissingImages } from './mergeProject.js';

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
    previousVideoAssetIds: [],
    generationState: 'pending',
    videoGenerationState: 'pending',
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

describe('mergeProjectFromServer', () => {
  it('keeps image generating state during regenerate', () => {
    const current = scene({
      id: 'a',
      currentAssetId: 'asset-a',
      generationState: 'complete',
    });
    const incoming = scene({
      id: 'a',
      currentAssetId: 'asset-a',
      generationState: 'generating',
    });
    const merged = mergeProjectFromServer(
      { id: 'p1', scenes: [current] } as MusicVideoProject,
      { id: 'p1', scenes: [incoming] } as MusicVideoProject,
    );
    expect(merged.scenes[0]?.generationState).toBe('generating');
  });

  it('keeps generating state during re-animate when a clip already exists', () => {
    const current = scene({
      id: 'a',
      currentVideoAssetId: 'vid-1',
      videoGenerationState: 'complete',
    });
    const incoming = scene({
      id: 'a',
      currentVideoAssetId: 'vid-1',
      videoGenerationState: 'generating',
    });
    const merged = mergeProjectFromServer(
      { id: 'p1', scenes: [current] } as MusicVideoProject,
      { id: 'p1', scenes: [incoming] } as MusicVideoProject,
    );
    expect(merged.scenes[0]?.videoGenerationState).toBe('generating');
  });
});
