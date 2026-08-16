import type { CharacterDefinition, GeneratedAsset, VisualBible, VisualStylePreset } from '@music-video/shared';
import type { StoryboardScene } from '@music-video/shared';
import type OpenAI from 'openai';
import { buildCharacterReferencePrompt, buildSceneImagePrompt } from './promptBuilder.js';

export type ImageSize = '1536x1024' | '1792x1024' | '1024x1024' | '1024x1536';
export type ImageOutputFormat = 'jpeg' | 'png' | 'webp';

export interface SceneImageGenerationRequest {
  scene: StoryboardScene;
  bible: VisualBible;
  style: VisualStylePreset;
  referenceImages?: Array<{ characterId: string; url: string }>;
  size?: ImageSize;
}

export interface CharacterReferenceRequest {
  character: CharacterDefinition;
  bible: VisualBible;
  style: VisualStylePreset;
  size?: ImageSize;
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

export interface OpenAiImageProviderOptions {
  defaultSize?: ImageSize;
  quality?: string;
  outputFormat?: ImageOutputFormat;
  requestTimeoutMs?: number;
}

const DEFAULT_IMAGE_TIMEOUT_MS = 90_000;

export class OpenAiImageProvider implements ImageGenerationProvider {
  private readonly defaultSize: ImageSize;
  private readonly quality: string;
  private readonly outputFormat: ImageOutputFormat;
  private readonly requestTimeoutMs: number;

  constructor(
    private readonly client: OpenAI,
    private readonly model: string,
    options: OpenAiImageProviderOptions = {},
  ) {
    this.defaultSize = options.defaultSize ?? '1536x1024';
    this.quality = options.quality ?? 'low';
    this.outputFormat = options.outputFormat ?? 'jpeg';
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_IMAGE_TIMEOUT_MS;
  }

  async generateSceneImage(request: SceneImageGenerationRequest): Promise<GeneratedImageBytes> {
    const { prompt, negativePrompt } = buildSceneImagePrompt({
      style: request.style,
      bible: request.bible,
      scene: request.scene,
      extraInstructions: referenceHint(request.referenceImages),
    });
    return this.generate(prompt, negativePrompt, request.size);
  }

  async generateCharacterReference(request: CharacterReferenceRequest): Promise<GeneratedImageBytes> {
    const prompt = buildCharacterReferencePrompt(request.character, request.bible, request.style);
    return this.generate(prompt, 'text, extra characters, collage labels', request.size);
  }

  private sizeForModel(requested?: ImageSize): ImageSize {
    if (this.model.includes('dall-e-3')) {
      return requested === '1024x1024' ? '1024x1024' : '1792x1024';
    }
    return requested ?? this.defaultSize;
  }

  private async generate(
    prompt: string,
    negativePrompt: string,
    requestedSize?: ImageSize,
  ): Promise<GeneratedImageBytes> {
    const fullPrompt = `${prompt}\nAvoid: ${negativePrompt}`.slice(0, 8000);
    const size = this.sizeForModel(requestedSize);
    try {
      return await this.requestImageWithRetry(fullPrompt, size);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/gpt-image-1|model.*not found|does not exist/i.test(message) && !this.model.includes('dall-e-3')) {
        const fallback = new OpenAiImageProvider(this.client, 'dall-e-3', {
          defaultSize: '1792x1024',
          quality: 'standard',
          outputFormat: 'png',
          requestTimeoutMs: this.requestTimeoutMs,
        });
        return fallback.requestImageWithRetry(fullPrompt, '1792x1024');
      }
      throw new Error(humanizeImageError(error));
    }
  }

  private async requestImageWithRetry(fullPrompt: string, size: ImageSize, attempt = 0): Promise<GeneratedImageBytes> {
    try {
      return await this.requestImage(fullPrompt, size);
    } catch (error) {
      if (attempt < 1 && isRetryableImageError(error)) {
        await sleep(1200);
        return this.requestImageWithRetry(fullPrompt, size, attempt + 1);
      }
      throw error;
    }
  }

  private gptQuality(): 'low' | 'medium' | 'high' | 'auto' {
    if (this.quality === 'low' || this.quality === 'medium' || this.quality === 'high' || this.quality === 'auto') {
      return this.quality;
    }
    return 'low';
  }

  private mimeTypeForOutput(): string {
    if (this.model.includes('dall-e')) return 'image/png';
    return `image/${this.outputFormat}`;
  }

  private async requestImage(fullPrompt: string, size: ImageSize): Promise<GeneratedImageBytes> {
    const params: OpenAI.Images.ImageGenerateParams = {
      model: this.model,
      prompt: fullPrompt,
      size,
    };
    if (this.model.includes('dall-e')) {
      params.n = 1;
      params.response_format = 'b64_json';
      if (this.model.includes('dall-e-3')) {
        params.quality = this.quality === 'hd' ? 'hd' : 'standard';
      }
    } else {
      params.quality = this.gptQuality();
      params.output_format = this.outputFormat;
    }
    const result = await this.client.images.generate(params);
    const image = result.data?.[0];
    if (!image) {
      throw new Error('Image provider returned no image.');
    }
    if (image.b64_json) {
      return {
        bytes: Buffer.from(image.b64_json, 'base64'),
        mimeType: this.mimeTypeForOutput(),
        prompt: fullPrompt,
        model: this.model,
        revisedPrompt: image.revised_prompt,
      };
    }
    if (image.url) {
      const response = await fetch(image.url, { signal: AbortSignal.timeout(this.requestTimeoutMs) });
      if (!response.ok) {
        throw new Error('Failed to download generated image.');
      }
      const mimeType = response.headers.get('content-type') ?? this.mimeTypeForOutput();
      return {
        bytes: Buffer.from(await response.arrayBuffer()),
        mimeType,
        prompt: fullPrompt,
        model: this.model,
        revisedPrompt: image.revised_prompt,
      };
    }
    throw new Error('Image provider returned neither bytes nor URL.');
  }
}

function humanizeImageError(error: unknown): string {
  if (!error || typeof error !== 'object') return 'The image provider returned an error.';
  const record = error as {
    message?: string;
    status?: number;
    error?: { message?: string; code?: string };
  };
  const message = record.error?.message ?? record.message ?? String(error);
  if (/timed out|timeout|ETIMEDOUT|AbortError/i.test(message)) {
    return 'The image provider took too long to respond. Try again.';
  }
  if (/billing|quota|insufficient/i.test(message)) {
    return 'OpenAI image generation is blocked by billing or quota. Add image-generation credit, then retry.';
  }
  if (/content.?policy|safety/i.test(message)) {
    return 'OpenAI refused this prompt. Edit the scene prompt and retry.';
  }
  if (/api key|unauthorized|401/i.test(message)) {
    return 'OpenAI rejected the API key.';
  }
  return message;
}

function isRetryableImageError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as { message?: string; status?: number; error?: { message?: string } };
  const message = record.error?.message ?? record.message ?? String(error);
  if (/timed out|timeout|ETIMEDOUT|AbortError|ECONNRESET|fetch failed/i.test(message)) return true;
  const status = record.status;
  if (typeof status === 'number' && (status === 429 || status >= 500)) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function referenceHint(refs?: Array<{ characterId: string; url: string }>): string {
  if (!refs || refs.length === 0) return '';
  return `Match locked character reference sheets for: ${refs.map((r) => r.characterId).join(', ')}. Keep identical costume, face, and proportions.`;
}
