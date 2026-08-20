import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { StoryboardScene, VisualBible, VisualStylePreset } from '@music-video/shared';

const { subscribe, upload } = vi.hoisted(() => ({
  subscribe: vi.fn(),
  upload: vi.fn(),
}));

vi.mock('@fal-ai/client', () => ({
  fal: {
    config: vi.fn(),
    subscribe,
    storage: { upload },
  },
}));

import { FalVideoProvider, KLING_I2V_ENDPOINT } from './videoGeneration.js';

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
  characters: [],
  environments: [],
  colorPalette: [],
  recurringProps: [],
  continuityRules: ['same apron'],
  negativeRules: ['no photorealism'],
  masterPrompt: 'A hand-painted cartoon music video world.',
};

const scene: StoryboardScene = {
  id: 'scene-1',
  order: 1,
  startTime: 0,
  endTime: 8,
  duration: 8,
  songSection: 'verse',
  title: 'Slip',
  description: 'Jens frozen mid-slip',
  action: 'soup in the air',
  characters: [],
  shotType: 'wide',
  cameraIntent: 'hold the gag',
  imagePrompt: 'soup arc',
  suggestedMotion: 'slowZoomIn',
  motion: 'slowZoomIn',
  transitionIn: 'cut',
  transitionOut: 'cut',
  mediaType: 'image',
  previousAssetIds: [],
  previousVideoAssetIds: [],
  generationState: 'complete',
  videoGenerationState: 'pending',
  approved: false,
};

function mockFetchVideo(bytes: Buffer) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    headers: { get: () => 'video/mp4' },
    arrayBuffer: async () => bytes,
  }) as typeof fetch;
}

describe('FalVideoProvider', () => {
  beforeEach(() => {
    subscribe.mockReset();
    upload.mockReset();
    vi.restoreAllMocks();
  });

  it('uploads the still and calls Kling i2v with audio disabled', async () => {
    mockFetchVideo(Buffer.from('clip'));
    upload.mockResolvedValue('https://fal.media/still.jpg');
    subscribe.mockResolvedValue({ data: { video: { url: 'https://example.com/clip.mp4' } } });

    const result = await new FalVideoProvider({ retryDelayMs: () => 0 }).generateSceneVideo({
      scene,
      bible,
      style,
      sourceImageBytes: Buffer.from('still'),
      sourceImageMimeType: 'image/jpeg',
    });

    expect(upload).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledWith(
      KLING_I2V_ENDPOINT,
      expect.objectContaining({
        input: expect.objectContaining({
          start_image_url: 'https://fal.media/still.jpg',
          duration: '10',
          generate_audio: false,
        }),
      }),
    );
    expect(result.bytes.toString()).toBe('clip');
    expect(result.durationSeconds).toBe(10);
  });

  it('uses a public still URL without re-uploading to fal storage', async () => {
    mockFetchVideo(Buffer.from('clip'));
    subscribe.mockResolvedValue({ data: { video: { url: 'https://example.com/clip.mp4' } } });

    await new FalVideoProvider({ retryDelayMs: () => 0 }).generateSceneVideo({
      scene,
      bible,
      style,
      sourceImageUrl: 'https://cdn.example.com/still.jpg',
      sourceImageBytes: Buffer.from('still'),
      sourceImageMimeType: 'image/jpeg',
    });

    expect(upload).not.toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalledWith(
      KLING_I2V_ENDPOINT,
      expect.objectContaining({
        input: expect.objectContaining({
          start_image_url: 'https://cdn.example.com/still.jpg',
        }),
      }),
    );
  });

  it('retries a rate limit and then succeeds', async () => {
    mockFetchVideo(Buffer.from('clip'));
    upload.mockResolvedValue('https://fal.media/still.jpg');
    subscribe
      .mockRejectedValueOnce({ status: 429, message: 'Rate limit exceeded' })
      .mockResolvedValueOnce({ data: { video: { url: 'https://example.com/clip.mp4' } } });

    const result = await new FalVideoProvider({ retryDelayMs: () => 0 }).generateSceneVideo({
      scene: { ...scene, duration: 4, endTime: 4 },
      bible,
      style,
      sourceImageBytes: Buffer.from('still'),
      sourceImageMimeType: 'image/jpeg',
    });

    expect(result.durationSeconds).toBe(5);
    expect(subscribe).toHaveBeenCalledTimes(2);
  });
});
