import type { StoryboardScene, VisualBible, VisualStylePreset } from '@music-video/shared';
import {
  errorText,
  isBillingOrQuotaError,
  isRetryableProviderError,
  MAX_IMAGE_ATTEMPTS,
  providerRetryDelayMs,
  sceneClipDurationSeconds,
  sleep,
} from '@music-video/shared';
import { fal } from '@fal-ai/client';
import { buildSceneVideoPrompt } from './promptBuilder.js';

export const KLING_I2V_ENDPOINT = 'fal-ai/kling-video/v2.6/pro/image-to-video';

export interface SceneVideoGenerationRequest {
  scene: StoryboardScene;
  bible: VisualBible;
  style: VisualStylePreset;
  sourceImageBytes?: Buffer;
  sourceImageMimeType?: string;
  /** When set, fal fetches the still directly instead of re-uploading bytes. */
  sourceImageUrl?: string;
}

export interface GeneratedVideoResult {
  videoUrl: string;
  mimeType: string;
  prompt: string;
  model: string;
  durationSeconds: number;
}

export interface FalVideoProviderOptions {
  requestTimeoutMs?: number;
  retryDelayMs?: (attempt: number) => number;
  credentials?: string;
}

const DEFAULT_VIDEO_TIMEOUT_MS = 300_000;

interface FalVideoResult {
  data?: {
    video?: { url?: string; content_type?: string };
  };
}

function extractVideoUrl(result: FalVideoResult): { url?: string; contentType?: string } {
  const direct = result.data?.video;
  if (direct?.url) {
    return { url: direct.url, contentType: direct.content_type };
  }
  const record = result.data as Record<string, unknown> | undefined;
  const nested = record?.video;
  if (nested && typeof nested === 'object' && nested !== null && 'url' in nested) {
    const url = (nested as { url?: unknown }).url;
    if (typeof url === 'string') {
      return {
        url,
        contentType:
          typeof (nested as { content_type?: unknown }).content_type === 'string'
            ? ((nested as { content_type?: string }).content_type ?? undefined)
            : undefined,
      };
    }
  }
  return {};
}

export class FalVideoProvider {
  private readonly requestTimeoutMs: number;
  private readonly retryDelayMs: (attempt: number) => number;

  constructor(options: FalVideoProviderOptions = {}) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_VIDEO_TIMEOUT_MS;
    this.retryDelayMs = options.retryDelayMs ?? ((attempt) => providerRetryDelayMs(attempt));
    if (options.credentials) {
      fal.config({ credentials: options.credentials });
    }
  }

  async generateSceneVideo(request: SceneVideoGenerationRequest): Promise<GeneratedVideoResult> {
    const { prompt, negativePrompt } = buildSceneVideoPrompt({
      style: request.style,
      bible: request.bible,
      scene: request.scene,
    });
    const duration = sceneClipDurationSeconds(request.scene.duration);
    const fullPrompt = `${prompt}\nAvoid: ${negativePrompt}`.slice(0, 2500);
    const startImageUrl = await this.resolveStartImageUrl(request);
    return this.generate(fullPrompt, startImageUrl, duration);
  }

  private async resolveStartImageUrl(request: SceneVideoGenerationRequest): Promise<string> {
    if (request.sourceImageUrl && isPublicHttpsUrl(request.sourceImageUrl)) {
      return request.sourceImageUrl;
    }
    if (!request.sourceImageBytes || !request.sourceImageMimeType) {
      throw new Error('A source still is required for video generation.');
    }
    return this.uploadSourceImage(request.sourceImageBytes, request.sourceImageMimeType);
  }

  private async generate(
    fullPrompt: string,
    startImageUrl: string,
    durationSeconds: 5 | 10,
  ): Promise<GeneratedVideoResult> {
    try {
      return await this.requestVideoWithRetry(fullPrompt, startImageUrl, durationSeconds);
    } catch (error) {
      throw new Error(humanizeVideoError(error));
    }
  }

  private async requestVideoWithRetry(
    fullPrompt: string,
    startImageUrl: string,
    durationSeconds: 5 | 10,
    attempt = 0,
  ): Promise<GeneratedVideoResult> {
    try {
      return await this.requestVideo(fullPrompt, startImageUrl, durationSeconds);
    } catch (error) {
      if (attempt < MAX_IMAGE_ATTEMPTS - 1 && isRetryableProviderError(error)) {
        await sleep(this.retryDelayMs(attempt));
        return this.requestVideoWithRetry(fullPrompt, startImageUrl, durationSeconds, attempt + 1);
      }
      throw error;
    }
  }

  private async uploadSourceImage(sourceImageBytes: Buffer, sourceImageMimeType: string): Promise<string> {
    const blob = new Blob([new Uint8Array(sourceImageBytes)], { type: sourceImageMimeType });
    const uploaded: unknown = await fal.storage.upload(blob);
    if (typeof uploaded === 'string') return uploaded;
    if (uploaded && typeof uploaded === 'object' && 'url' in uploaded) {
      const url = (uploaded as { url?: unknown }).url;
      if (typeof url === 'string') return url;
    }
    throw new Error('Failed to upload source still for video generation.');
  }

  private async requestVideo(
    fullPrompt: string,
    startImageUrl: string,
    durationSeconds: 5 | 10,
  ): Promise<GeneratedVideoResult> {
    const duration = durationSeconds === 10 ? '10' : '5';
    const result = (await fal.subscribe(KLING_I2V_ENDPOINT, {
      input: {
        prompt: fullPrompt,
        start_image_url: startImageUrl,
        duration,
        generate_audio: false,
      },
    })) as FalVideoResult;

    const { url: videoUrl, contentType } = extractVideoUrl(result);
    if (!videoUrl) {
      throw new Error('Video provider returned no clip.');
    }

    return {
      videoUrl,
      mimeType: contentType ?? 'video/mp4',
      prompt: fullPrompt,
      model: KLING_I2V_ENDPOINT,
      durationSeconds,
    };
  }
}

function humanizeVideoError(error: unknown): string {
  const message = errorText(error);
  if (/timed out|timeout|ETIMEDOUT|AbortError/i.test(message)) {
    return 'The video provider took too long to respond. Try again.';
  }
  if (isBillingOrQuotaError(error)) {
    return 'fal.ai video generation is blocked by billing or quota. Add credit, then retry.';
  }
  if (/content.?policy|safety|nsfw/i.test(message)) {
    return 'fal.ai refused this motion prompt. Edit the scene and retry.';
  }
  if (/api key|unauthorized|401|403/i.test(message)) {
    return 'fal.ai rejected the API key.';
  }
  return message || 'The video provider returned an error.';
}

function isPublicHttpsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    return !['localhost', '127.0.0.1'].includes(parsed.hostname);
  } catch {
    return false;
  }
}
