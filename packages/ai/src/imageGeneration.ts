import type { CharacterDefinition, GeneratedAsset, ImageQualityPreset, VisualBible, VisualStylePreset } from '@music-video/shared';
import type { StoryboardScene } from '@music-video/shared';
import {
  contentPolicyHint,
  errorText,
  findRiskyPromptTerms,
  isBillingOrQuotaError,
  isContentPolicyError,
  isRetryableProviderError,
  MAX_IMAGE_ATTEMPTS,
  providerRetryDelayMs,
  sanitizeImagePromptForSafety,
  sleep,
  truncateForLog,
} from '@music-video/shared';
import { fal } from '@fal-ai/client';
import { ensureFalConfigured } from './falClient.js';
import {
  buildCharacterImageNegative,
  buildCharacterReferencePrompt,
  buildMinimalSafeSceneImagePrompt,
  buildSceneImagePrompt,
  buildUltraMinimalSafeSceneImagePrompt,
} from './promptBuilder.js';

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
      ensureFalConfigured(options.credentials);
    }
  }

  async generateSceneImage(request: SceneImageGenerationRequest): Promise<GeneratedImageBytes> {
    const promptInput = {
      style: request.style,
      bible: request.bible,
      scene: request.scene,
      extraInstructions: referenceHint(request.referenceImages),
    };
    const { prompt, negativePrompt } = buildSceneImagePrompt(promptInput);
    const minimalPrompt = buildMinimalSafeSceneImagePrompt(promptInput);
    const ultraMinimalPrompt = buildUltraMinimalSafeSceneImagePrompt(promptInput);
    return this.generateWithSafetyRetries(prompt, negativePrompt, minimalPrompt, ultraMinimalPrompt);
  }

  async generateCharacterReference(request: CharacterReferenceRequest): Promise<GeneratedImageBytes> {
    const prompt = buildCharacterReferencePrompt(request.character, request.bible, request.style);
    const negativePrompt = buildCharacterImageNegative(request.style, request.bible);
    return this.generateWithSafetyRetries(prompt, negativePrompt);
  }

  private async generateWithSafetyRetries(
    prompt: string,
    negativePrompt: string,
    minimalPrompt?: string,
    ultraMinimalPrompt?: string,
  ): Promise<GeneratedImageBytes> {
    const fullPrompt = `${prompt}\nAvoid: ${negativePrompt}`.slice(0, 8000);
    const saferPrompt = sanitizeImagePromptForSafety(fullPrompt);
    const minimalFullPrompt = minimalPrompt
      ? sanitizeImagePromptForSafety(`${minimalPrompt}\nAvoid: ${negativePrompt}`.slice(0, 8000))
      : undefined;
    const ultraMinimalFullPrompt = ultraMinimalPrompt
      ? sanitizeImagePromptForSafety(`${ultraMinimalPrompt}\nAvoid: ${negativePrompt}`.slice(0, 8000))
      : undefined;
    const candidates = [fullPrompt, saferPrompt, minimalFullPrompt, ultraMinimalFullPrompt].filter(
      (candidate, index, list): candidate is string =>
        Boolean(candidate) && list.indexOf(candidate) === index,
    );

    let lastError: unknown;
    let lastPrompt = fullPrompt;
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index]!;
      lastPrompt = candidate;
      try {
        return await this.requestImageWithRetry(candidate);
      } catch (error) {
        lastError = error;
        if (!isContentPolicyError(error)) {
          throw new Error(humanizeImageError(error, candidate));
        }
        logContentPolicyAttempt(index + 1, candidates.length, candidate, error);
      }
    }

    throw new Error(humanizeImageError(lastError, lastPrompt));
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

function logContentPolicyAttempt(
  attempt: number,
  total: number,
  prompt: string,
  error: unknown,
): void {
  const terms = findRiskyPromptTerms(prompt);
  console.warn(
    `[fal] content policy attempt ${attempt}/${total}: ${errorText(error)} | risky terms: ${terms.join(', ') || 'none detected'} | prompt: ${truncateForLog(prompt, 500)}`,
  );
}

function humanizeImageError(error: unknown, prompt?: string): string {
  const message = errorText(error);
  if (/timed out|timeout|ETIMEDOUT|AbortError/i.test(message)) {
    return 'The image provider took too long to respond. Try again.';
  }
  if (isBillingOrQuotaError(error)) {
    return 'fal.ai image generation is blocked by billing or quota. Add credit, then retry.';
  }
  if (isContentPolicyError(error)) {
    const hint = contentPolicyHint(prompt);
    return `fal.ai flagged this scene as unsafe. Use Make safer in the scene editor, then retry.${hint ? ` ${hint}` : ''}`;
  }
  if (/api key|unauthorized|401|403/i.test(message)) {
    return 'fal.ai rejected the API key.';
  }
  if (/422|unprocessable|validation|value_error|enum/i.test(message)) {
    return `fal.ai rejected this prompt (${message}). Edit the scene prompt and retry.`;
  }
  return message || 'The image provider returned an error.';
}

function referenceHint(refs?: Array<{ characterId: string; url: string }>): string {
  if (!refs || refs.length === 0) return '';
  return `Match locked character reference sheets for: ${refs.map((r) => r.characterId).join(', ')}. Keep identical costume, face, and proportions.`;
}
