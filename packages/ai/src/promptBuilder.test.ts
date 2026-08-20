import { describe, expect, it } from 'vitest';
import { getVisualStyle, type StoryboardScene, type VisualBible, type VisualStylePreset } from '@music-video/shared';
import { buildCharacterReferencePrompt, buildSceneImagePrompt, buildSceneVideoPrompt } from './promptBuilder.js';

const style: VisualStylePreset = {
  id: 'cartoon-slapstick',
  name: 'Cartoon Slapstick',
  description: 'gags',
  promptInstructions: 'thick ink cartoon',
  defaultColorMood: 'warm',
  defaultMotionIntensity: 1,
  accent: '#fff',
  secondary: '#000',
};

const storybook = getVisualStyle('illustrated-storybook');

const bible: VisualBible = {
  projectTitle: 'Test',
  overallStyle: {
    visualMedium: 'cartoon',
    mood: 'funny',
    renderingStyle: '2d',
    cameraLanguage: 'wide then close',
    animationLanguage: 'still ken burns',
  },
  characters: [
    {
      id: 'jens',
      name: 'Jens',
      role: 'cook',
      bodyType: 'lanky',
      face: 'round nose',
      hair: 'wild tuft',
      clothing: 'striped apron',
      colors: ['#c00'],
      personality: 'proud',
      expressions: ['grin'],
      importantContinuityFeatures: ['striped apron', 'tuft'],
      promptDescription: 'lanky cartoon cook in a striped apron',
      lockedReferenceImage: false,
    },
  ],
  environments: [
    {
      id: 'galley',
      name: 'Galley',
      description: 'ship kitchen',
      layout: 'narrow',
      materials: ['copper'],
      importantObjects: ['pots'],
      lighting: 'warm practicals',
      colors: ['#642'],
      continuityFeatures: ['porthole'],
      promptDescription: 'cramped ship galley with porthole',
    },
  ],
  colorPalette: [{ name: 'copper', hex: '#b87333', usage: 'pots' }],
  recurringProps: [],
  continuityRules: ['same apron'],
  negativeRules: ['no photorealism'],
  masterPrompt: 'A hand-painted cartoon music video world.',
};

const scene: Pick<
  StoryboardScene,
  | 'title'
  | 'description'
  | 'action'
  | 'shotType'
  | 'cameraIntent'
  | 'visualComedy'
  | 'imagePrompt'
  | 'characters'
  | 'environmentId'
  | 'negativePrompt'
  | 'suggestedMotion'
  | 'songSection'
  | 'lyricsExcerpt'
> = {
  title: 'Slip',
  description: 'Jens frozen mid-slip',
  action: 'soup in the air',
  shotType: 'wide',
  cameraIntent: 'hold the gag',
  visualComedy: 'herring underfoot',
  imagePrompt: 'soup arc',
  characters: ['jens'],
  environmentId: 'galley',
  suggestedMotion: 'slowZoomIn',
  songSection: 'verse',
  lyricsExcerpt: 'soup goes flying',
};

describe('buildSceneImagePrompt', () => {
  it('includes master prompt, character, environment, and camera', () => {
    const { prompt, negativePrompt } = buildSceneImagePrompt({ style, bible, scene });
    expect(prompt).toContain('hand-painted cartoon');
    expect(prompt).toContain('striped apron');
    expect(prompt).toContain('porthole');
    expect(prompt).toContain('wide');
    expect(prompt).toContain('Ken Burns');
    expect(negativePrompt).toContain('photorealism');
  });

  it('leads with the style lock so Flux keeps the chosen look', () => {
    const { prompt } = buildSceneImagePrompt({ style, bible, scene });
    expect(prompt.startsWith('STYLE LOCK — Cartoon Slapstick:')).toBe(true);
  });

  it('adds anti-photoreal negatives for illustrated storybook', () => {
    const { prompt, negativePrompt } = buildSceneImagePrompt({
      style: storybook,
      bible: {
        ...bible,
        masterPrompt: 'A painted storybook music video world.',
        overallStyle: {
          visualMedium: 'Illustrated Storybook',
          mood: 'soft watercolor warmth',
          renderingStyle: storybook.promptInstructions,
          cameraLanguage: 'gentle',
          animationLanguage: 'still',
        },
      },
      scene: {
        ...scene,
        title: 'Endless Roads',
        description: 'Three friends laughing in the back seat of a car on an open road',
        action: 'frozen mid-laugh',
      },
    });
    expect(prompt.startsWith('STYLE LOCK — Illustrated Storybook:')).toBe(true);
    expect(prompt).toContain('NOT a photograph');
    expect(prompt).toContain('illustrated story frame');
    expect(negativePrompt).toContain('photorealistic');
    expect(negativePrompt).toContain('stock photo');
  });
});

describe('buildSceneVideoPrompt', () => {
  it('adds story, lyric, character, and gag-aware motion language', () => {
    const { prompt, negativePrompt } = buildSceneVideoPrompt({ style, bible, scene });
    expect(prompt).toContain('Subtle in-place motion only');
    expect(prompt).toContain('slow push-in');
    expect(prompt).toContain('Scene: Slip');
    expect(prompt).toContain('soup goes flying');
    expect(prompt).toContain('Visual gag: herring underfoot');
    expect(prompt).toContain('Jens');
    expect(prompt).toContain('striped apron');
    expect(prompt).toContain('Galley');
    expect(prompt).toContain('play the gag');
    expect(negativePrompt).toContain('scene change');
    expect(negativePrompt).toContain('face morphing');
    expect(prompt.length).toBeLessThanOrEqual(2000);
  });

  it('handles instrumental passages without lyrics', () => {
    const { prompt } = buildSceneVideoPrompt({
      style,
      bible,
      scene: { ...scene, lyricsExcerpt: undefined, songSection: 'bridge' },
    });
    expect(prompt).toContain('Instrumental bridge passage');
    expect(prompt).not.toContain('matches the lyric');
  });
});

describe('buildCharacterReferencePrompt', () => {
  it('asks for a family-friendly adult character sheet', () => {
    const prompt = buildCharacterReferencePrompt(bible.characters[0]!, bible, style);
    expect(prompt).toContain('Jens');
    expect(prompt).toContain('striped apron');
    expect(prompt).toContain('adult');
    expect(prompt).toContain('illustrated');
    expect(prompt).not.toMatch(/\bchild\b/i);
  });
});
