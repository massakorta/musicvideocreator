import { describe, expect, it, vi } from 'vitest';
import type { CharacterDefinition, VisualBible, VisualStylePreset } from '@music-video/shared';
import { OpenAiImageProvider } from './imageGeneration.js';

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

const character: CharacterDefinition = {
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
  characters: [character],
  environments: [],
  colorPalette: [],
  recurringProps: [],
  continuityRules: ['same apron'],
  negativeRules: ['no photorealism'],
  masterPrompt: 'A hand-painted cartoon music video world.',
};

function provider(generate: ReturnType<typeof vi.fn>) {
  return new OpenAiImageProvider({ images: { generate } } as never, 'gpt-image-1-mini', {
    retryDelayMs: () => 0,
  });
}

describe('OpenAiImageProvider', () => {
  it('retries a rate limit and then succeeds', async () => {
    const generate = vi
      .fn()
      .mockRejectedValueOnce({ status: 429, message: 'Rate limit exceeded' })
      .mockResolvedValueOnce({ data: [{ b64_json: Buffer.from('ok').toString('base64') }] });

    const image = await provider(generate).generateCharacterReference({ character, bible, style });
    expect(image.bytes.toString()).toBe('ok');
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('retries a content-policy refusal with a safer prompt', async () => {
    const generate = vi
      .fn()
      .mockRejectedValueOnce({ error: { message: 'Your request was rejected as a result of our safety system' } })
      .mockResolvedValueOnce({ data: [{ b64_json: Buffer.from('safe').toString('base64') }] });

    const image = await provider(generate).generateCharacterReference({ character, bible, style });
    expect(image.bytes.toString()).toBe('safe');
    expect(generate).toHaveBeenCalledTimes(2);
    const firstPrompt = generate.mock.calls[0]?.[0]?.prompt as string;
    const saferPrompt = generate.mock.calls[1]?.[0]?.prompt as string;
    expect(saferPrompt).not.toBe(firstPrompt);
    expect(saferPrompt).toContain('clearly adult character');
  });
});
