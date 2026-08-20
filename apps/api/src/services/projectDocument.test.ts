import { describe, expect, it } from 'vitest';
import type { CharacterDefinition, StoryboardScene, VisualBible } from '@music-video/shared';
import { mergeCharacterState, mergeProjectDocuments, mergeSceneState } from './projectUtils.js';

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

function character(overrides: Partial<CharacterDefinition> & Pick<CharacterDefinition, 'id'>): CharacterDefinition {
  return {
    name: overrides.id,
    role: 'lead',
    bodyType: 'average',
    face: 'round',
    hair: 'short',
    clothing: 'coat',
    colors: ['#000'],
    personality: 'calm',
    expressions: ['smile'],
    importantContinuityFeatures: ['coat'],
    promptDescription: 'an adult in a coat',
    lockedReferenceImage: false,
    ...overrides,
  };
}

function bible(characters: CharacterDefinition[]): VisualBible {
  return {
    projectTitle: 'Test',
    overallStyle: {
      visualMedium: 'cartoon',
      mood: 'funny',
      renderingStyle: '2d',
      cameraLanguage: 'wide',
      animationLanguage: 'still',
    },
    characters,
    environments: [],
    colorPalette: [],
    recurringProps: [],
    continuityRules: ['same coat'],
    negativeRules: ['no text'],
    masterPrompt: 'A cartoon world for testing character merge.',
  };
}

describe('mergeCharacterState', () => {
  it('keeps a finished reference when a stale write drops it', () => {
    const previous = character({ id: 'jens', referenceAssetId: 'ref-a', referenceUrl: '/a.png', lockedReferenceImage: true });
    const incoming = character({ id: 'jens' });
    const merged = mergeCharacterState(previous, incoming);
    expect(merged.referenceAssetId).toBe('ref-a');
    expect(merged.lockedReferenceImage).toBe(true);
  });

  it('preserves both character sheets when two finish concurrently', () => {
    const merged = mergeProjectDocuments(
      {
        scenes: [],
        visualBible: bible([
          character({ id: 'jens', referenceAssetId: 'ref-jens', lockedReferenceImage: true }),
          character({ id: 'cook' }),
        ]),
      } as never,
      {
        scenes: [],
        visualBible: bible([
          character({ id: 'jens' }),
          character({ id: 'cook', referenceAssetId: 'ref-cook', lockedReferenceImage: true }),
        ]),
      } as never,
    );

    expect(merged.visualBible?.characters.find((c) => c.id === 'jens')?.referenceAssetId).toBe('ref-jens');
    expect(merged.visualBible?.characters.find((c) => c.id === 'cook')?.referenceAssetId).toBe('ref-cook');
  });
});
