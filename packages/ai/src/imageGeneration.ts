import type { CharacterDefinition, GeneratedAsset, ImageQualityPreset, VisualBible, VisualStylePreset } from '@music-video/shared';
import type { StoryboardScene } from '@music-video/shared';
import {
  isContentPolicyError,
  isRetryableProviderError,
  MAX_IMAGE_ATTEMPTS,
  providerRetryDelayMs,
  sanitizeImagePromptForSafety,
  sleep,
} from '@music-video/shared';
import { fal } from '@fal-ai/client';
import { buildCharacterImageNegative, buildCharacterReferencePrompt, buildSceneImagePrompt } from './promptBuilder.js';

export interface SceneImageGenerationRequest {
  scene: StoryboardScene;
  bible: VisualBible;
  style: VisualStylePreset;
  referenceImages?: Array<{ characterId: string; url: string }>;
}

export interface CharacterReferenceRequest {
  character: CharacterDefinition;
  bible: VisualBible;
  style: VisualStylePreset;
}

export interface GeneratedImageBytes {
  bytes: Buffer;
  mimeType: string;
  prompt: string;
  model: string;
  revisedPrompt?: string;
}

export interface ImageGenerationProvider {
  generateSceneImage(request: SceneImageGenerationRequest): Promise<GeneratedImageBytes>;
  generateCharacterReference(request: CharacterReferenceRequest): Promise<GeneratedImageBytes>;
}

export interface VideoGenerationRequest {
  scene: StoryboardScene;
  sourceImageUrl: string;
  durationSeconds: number;
}

export interface VideoGenerationProvider {
  generateVideo(request: VideoGenerationRequest): Promise<GeneratedAsset>;
}

export interface FalImageProviderOptions {
  requestTimeoutMs?: number;
  retryDelayMs?: (attempt: number) => number;
  credentials?: string;
}

const DEFAULT_IMAGE_TIMEOUT_MS = 180_000;

interface FalImageResult {
  data?: {
    images?: Array<{ url?: string; content_type?: string }>;
    prompt?: string;
  };
}

export class FalImageProvider implements ImageGenerationProvider {
  private readonly requestTimeoutMs: number;
  private readonly retryDelayMs: (attempt: number) => number;

  constructor(
    private readonly preset: ImageQualityPreset,
    options: FalImageProviderOptions = {},
  ) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_IMAGE_TIMEOUT_MS;
    this.retryDelayMs = options.retryDelayMs ?? ((attempt) => providerRetryDelayMs(attempt));
    if (options.credentials) {
      fal.config({ credentials: options.credentials });
    }
  }

  async generateSceneImage(request: SceneImageGenerationRequest): Promise<GeneratedImageBytes> {
    const { prompt, negativePrompt } = buildSceneImagePrompt({
      style: request.style,
      bible: request.bible,
      scene: request.scene,
      extraInstructions: referenceHint(request.referenceImages),
    });
    return this.generate(prompt, negativePrompt);
  }

  async generateCharacterReference(request: CharacterReferenceRequest): Promise<GeneratedImageBytes> {
    const prompt = buildCharacterReferencePrompt(request.character, request.bible, request.style);
    const negativePrompt = buildCharacterImageNegative(request.style, request.bible);
    return this.generate(prompt, negativePrompt);
  }

  private async generate(prompt: string, negativePrompt: string): Promise<GeneratedImageBytes> {
    const fullPrompt = `${prompt}\nAvoid: ${negativePrompt}`.slice(0, 8000);
    try {
      return await this.requestImageWithRetry(fullPrompt);
    } catch (error) {
      if (isContentPolicyError(error)) {
        const safer = sanitizeImagePromptForSafety(fullPrompt);
        if (safer !== fullPrompt) {
          try {
            return await this.requestImageWithRetry(safer);
          } catch (saferError) {
            throw new Error(humanizeImageError(saferError));
          }
        }
      }
      throw new Error(humanizeImageError(error));
    }
  }

  private async requestImageWithRetry(fullPrompt: string, attempt = 0): Promise<GeneratedImageBytes> {
    try {
      return await this.requestImage(fullPrompt);
    } catch (error) {
      if (attempt < MAX_IMAGE_ATTEMPTS - 1 && isRetryableProviderError(error)) {
        await sleep(this.retryDelayMs(attempt));
        return this.requestImageWithRetry(fullPrompt, attempt + 1);
      }
      throw error;
    }
  }

  private falInput(fullPrompt: string): Record<string, unknown> {
    const input: Record<string, unknown> = {
      prompt: fullPrompt,
      output_format: 'jpeg',
      enable_safety_checker: true,
      num_images: 1,
    };
    const { falOptions } = this.preset;
    if (falOptions.image_size) input.image_size = falOptions.image_size;
    if (falOptions.num_inference_steps) input.num_inference_steps = falOptions.num_inference_steps;
    if (falOptions.acceleration) input.acceleration = falOptions.acceleration;
    return input;
  }

  private async requestImage(fullPrompt: string): Promise<GeneratedImageBytes> {
    const result = (await fal.subscribe(this.preset.falEndpoint, {
      input: this.falInput(fullPrompt),
    })) as FalImageResult;

    const image = result.data?.images?.[0];
    if (!image?.url) {
      throw new Error('Image provider returned no image.');
    }

    const response = await fetch(image.url, { signal: AbortSignal.timeout(this.requestTimeoutMs) });
    if (!response.ok) {
      throw new Error('Failed to download generated image.');
    }
    const mimeType = image.content_type ?? response.headers.get('content-type') ?? 'image/jpeg';
    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      mimeType,
      prompt: fullPrompt,
      model: this.preset.falEndpoint,
      revisedPrompt: result.data?.prompt,
    };
  }
}

function humanizeImageError(error: unknown): string {
  if (!error || typeof error !== 'object') return 'The image provider returned an error.';
  const record = error as {
    message?: string;
    status?: number;
    body?: { detail?: string };
  };
  const message = record.body?.detail ?? record.message ?? String(error);
  if (/timed out|timeout|ETIMEDOUT|AbortError/i.test(message)) {
    return 'The image provider took too long to respond. Try again.';
  }
  if (/billing|quota|insufficient|credit/i.test(message)) {
    return 'fal.ai image generation is blocked by billing or quota. Add credit, then retry.';
  }
  if (/content.?policy|safety|nsfw/i.test(message)) {
    return 'fal.ai refused this prompt. Edit the scene prompt and retry.';
  }
  if (/api key|unauthorized|401|403/i.test(message)) {
    return 'fal.ai rejected the API key.';
  }
  return message;
}

function referenceHint(refs?: Array<{ characterId: string; url: string }>): string {
  if (!refs || refs.length === 0) return '';
  return `Match locked character reference sheets for: ${refs.map((r) => r.characterId).join(', ')}. Keep identical costume, face, and proportions.`;
}
