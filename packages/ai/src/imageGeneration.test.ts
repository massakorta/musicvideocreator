import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { CharacterDefinition, VisualBible, VisualStylePreset } from '@music-video/shared';
import { IMAGE_QUALITY_PRESETS } from '@music-video/shared';

const { subscribe } = vi.hoisted(() => ({
  subscribe: vi.fn(),
}));

vi.mock('@fal-ai/client', () => ({
  fal: {
    config: vi.fn(),
    subscribe,
  },
}));

import { FalImageProvider } from './imageGeneration.js';

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

function mockFetchImage(bytes: Buffer) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    headers: { get: () => 'image/jpeg' },
    arrayBuffer: async () => bytes,
  }) as typeof fetch;
}

function provider() {
  return new FalImageProvider(IMAGE_QUALITY_PRESETS[0]!, {
    retryDelayMs: () => 0,
  });
}

describe('FalImageProvider', () => {
  beforeEach(() => {
    subscribe.mockReset();
    vi.restoreAllMocks();
  });

  it('retries a rate limit and then succeeds', async () => {
    mockFetchImage(Buffer.from('ok'));
    subscribe
      .mockRejectedValueOnce({ status: 429, message: 'Rate limit exceeded' })
      .mockResolvedValueOnce({ data: { images: [{ url: 'https://example.com/a.jpg' }] } });

    const image = await provider().generateCharacterReference({ character, bible, style });
    expect(image.bytes.toString()).toBe('ok');
    expect(subscribe).toHaveBeenCalledTimes(2);
  });

  it('retries fal TOP_UP billing lock and then succeeds', async () => {
    mockFetchImage(Buffer.from('ok'));
    subscribe
      .mockRejectedValueOnce(new Error('User is locked. Reason: TOP_UP.'))
      .mockResolvedValueOnce({ data: { images: [{ url: 'https://example.com/topup.jpg' }] } });

    const image = await provider().generateCharacterReference({ character, bible, style });
    expect(image.bytes.toString()).toBe('ok');
    expect(subscribe).toHaveBeenCalledTimes(2);
  });

  it('retries a content-policy refusal with a safer prompt', async () => {
    mockFetchImage(Buffer.from('safe'));
    subscribe
      .mockRejectedValueOnce({ message: 'Your request was rejected as a result of our safety system' })
      .mockResolvedValueOnce({ data: { images: [{ url: 'https://example.com/b.jpg' }] } });

    const image = await provider().generateCharacterReference({ character, bible, style });
    expect(image.bytes.toString()).toBe('safe');
    expect(subscribe).toHaveBeenCalledTimes(2);
    const firstPrompt = subscribe.mock.calls[0]?.[1]?.input?.prompt as string;
    const saferPrompt = subscribe.mock.calls[1]?.[1]?.input?.prompt as string;
    expect(saferPrompt).not.toBe(firstPrompt);
    expect(saferPrompt).toContain('clearly adult character');
  });
});
