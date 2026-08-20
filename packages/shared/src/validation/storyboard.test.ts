import { describe, expect, it } from 'vitest';
import type { StoryboardScene } from '../storyboard.js';
import type { MusicVideoProject } from '../project.js';
import { parseLyricSections, suggestedSceneCount } from '../lyrics.js';
import {
  computeProjectHealth,
  coveragePercent,
  reindexScenes,
  validateSceneTiming,
} from './storyboard.js';

function scene(partial: Partial<StoryboardScene> & Pick<StoryboardScene, 'id' | 'startTime' | 'endTime'>): StoryboardScene {
  return {
    order: 1,
    duration: partial.endTime - partial.startTime,
    songSection: 'verse',
    title: partial.id,
    description: 'desc',
    action: 'frozen moment',
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
    generationState: 'pending',
    videoGenerationState: 'pending',
    approved: false,
    ...partial,
  };
}

describe('validateSceneTiming', () => {
  it('detects gaps and overlaps', () => {
    const scenes = [
      scene({ id: 'a', startTime: 0, endTime: 4, order: 1 }),
      scene({ id: 'b', startTime: 5, endTime: 8, order: 2 }),
      scene({ id: 'c', startTime: 7.5, endTime: 12, order: 3 }),
    ];
    const issues = validateSceneTiming(scenes, 12);
    expect(issues.some((i) => i.type === 'gap')).toBe(true);
    expect(issues.some((i) => i.type === 'overlap')).toBe(true);
  });

  it('flags negative duration', () => {
    const issues = validateSceneTiming([scene({ id: 'a', startTime: 4, endTime: 2 })], 10);
    expect(issues.some((i) => i.type === 'negative_duration')).toBe(true);
  });

  it('accepts a complete cover', () => {
    const scenes = [
      scene({ id: 'a', startTime: 0, endTime: 5, order: 1 }),
      scene({ id: 'b', startTime: 5, endTime: 10, order: 2 }),
    ];
    expect(validateSceneTiming(scenes, 10)).toEqual([]);
    expect(coveragePercent(scenes, 10)).toBe(100);
  });
});

describe('reindexScenes', () => {
  it('orders by start time', () => {
    const result = reindexScenes([
      scene({ id: 'b', startTime: 5, endTime: 8, order: 1 }),
      scene({ id: 'a', startTime: 0, endTime: 5, order: 2 }),
    ]);
    expect(result.map((s) => s.id)).toEqual(['a', 'b']);
    expect(result.map((s) => s.order)).toEqual([1, 2]);
  });
});

describe('parseLyricSections', () => {
  it('keeps labeled sections', () => {
    const lyrics = `[Intro]\nla la\n[Verse 1]\nhello kitchen\n[Chorus]\nsoup soup`;
    const sections = parseLyricSections(lyrics);
    expect(sections.map((s) => s.label)).toEqual(['Intro', 'Verse 1', 'Chorus']);
  });
});

describe('suggestedSceneCount', () => {
  it('scales with duration inside 20-50', () => {
    expect(suggestedSceneCount(120).target).toBeGreaterThanOrEqual(20);
    expect(suggestedSceneCount(300).target).toBeLessThanOrEqual(50);
    expect(suggestedSceneCount(300).target).toBeGreaterThan(suggestedSceneCount(120).target);
  });
});

describe('computeProjectHealth', () => {
  it('blocks render when images are missing', () => {
    const project: MusicVideoProject = {
      id: 'p1',
      name: 'Test',
      songTitle: 'Test',
      status: 'storyboard',
      durationSeconds: 10,
      lyrics: '',
      visualBibleApproved: true,
      scenes: [
        scene({ id: 'a', startTime: 0, endTime: 10, title: 'Scene 1' }),
      ],
      formatId: '16x9',
      captionsEnabled: false,
      createdAt: '',
      updatedAt: '',
      audio: { url: '/a.mp3', filename: 'a.mp3', durationSeconds: 10, mimeType: 'audio/mpeg' },
    };
    const health = computeProjectHealth(project);
    expect(health.readyToRender).toBe(false);
    expect(health.missingImages).toContain('Scene 1');
  });
});
