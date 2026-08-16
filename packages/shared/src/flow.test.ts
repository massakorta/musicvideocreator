import { describe, expect, it } from 'vitest';
import { completedEditorStepCount, isEditorStepComplete, nextEditorStep } from './flow.js';
import type { MusicVideoProject } from './project.js';

function project(partial: Partial<MusicVideoProject> = {}): MusicVideoProject {
  return {
    id: 'p1',
    name: 'Test',
    songTitle: 'Test',
    status: 'setup',
    durationSeconds: 30,
    lyrics: '',
    visualBibleApproved: false,
    scenes: [],
    formatId: '16x9',
    captionsEnabled: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('editor flow', () => {
  it('starts on setup until audio and lyrics exist', () => {
    expect(nextEditorStep(project())).toBe('setup');
    expect(
      nextEditorStep(
        project({
          audio: {
            url: '/a.mp3',
            filename: 'a.mp3',
            durationSeconds: 30,
            mimeType: 'audio/mpeg',
          },
          lyrics: '[Verse]\nHello',
        }),
      ),
    ).toBe('style');
  });

  it('moves through bible, characters, storyboard, then images', () => {
    const base = project({
      audio: { url: '/a.mp3', filename: 'a.mp3', durationSeconds: 30, mimeType: 'audio/mpeg' },
      lyrics: '[Verse]\nHello',
      styleId: 'cartoon',
      visualBibleApproved: true,
      visualBible: {
        projectTitle: 'Test',
        overallStyle: {
          visualMedium: 'still',
          mood: 'warm',
          renderingStyle: 'paint',
          cameraLanguage: 'hold',
          animationLanguage: 'kenburns',
        },
        characters: [
          {
            id: 'c1',
            name: 'Jens',
            role: 'lead',
            bodyType: 'lanky',
            face: 'round',
            hair: 'brown',
            clothing: 'apron',
            colors: [],
            personality: 'clumsy',
            expressions: [],
            importantContinuityFeatures: [],
            promptDescription: 'Jens',
            lockedReferenceImage: false,
          },
        ],
        environments: [],
        colorPalette: [],
        recurringProps: [],
        continuityRules: [],
        negativeRules: [],
      },
    });

    expect(nextEditorStep(base)).toBe('characters');
    expect(isEditorStepComplete(base, 'characters')).toBe(false);

    const withRef = {
      ...base,
      visualBible: {
        ...base.visualBible!,
        characters: [{ ...base.visualBible!.characters[0]!, referenceAssetId: 'asset-1' }],
      },
    };
    expect(nextEditorStep(withRef)).toBe('storyboard');
    expect(completedEditorStepCount(withRef)).toBe(4);
  });
});
