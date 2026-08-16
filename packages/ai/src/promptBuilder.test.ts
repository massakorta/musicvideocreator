import { describe, expect, it } from 'vitest';
import type { StoryboardScene, VisualBible, VisualStylePreset } from '@music-video/shared';
import { buildSceneImagePrompt } from './promptBuilder.js';

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
});
