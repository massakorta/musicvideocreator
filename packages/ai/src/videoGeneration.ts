import type { StoryboardScene, VisualBible, VisualStylePreset } from '@music-video/shared';
import {
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
  sourceImageBytes: Buffer;
  sourceImageMimeType: string;
}

export interface GeneratedVideoBytes {
  bytes: Buffer;
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

  async generateSceneVideo(request: SceneVideoGenerationRequest): Promise<GeneratedVideoBytes> {
    const { prompt, negativePrompt } = buildSceneVideoPrompt({
      style: request.style,
      bible: request.bible,
      scene: request.scene,
    });
    const duration = sceneClipDurationSeconds(request.scene.duration);
    const fullPrompt = `${prompt}\nAvoid: ${negativePrompt}`.slice(0, 8000);
    return this.generate(fullPrompt, request.sourceImageBytes, request.sourceImageMimeType, duration);
  }

  private async generate(
    fullPrompt: string,
    sourceImageBytes: Buffer,
    sourceImageMimeType: string,
    durationSeconds: 5 | 10,
  ): Promise<GeneratedVideoBytes> {
    try {
      return await this.requestVideoWithRetry(fullPrompt, sourceImageBytes, sourceImageMimeType, durationSeconds);
    } catch (error) {
      throw new Error(humanizeVideoError(error));
    }
  }

  private async requestVideoWithRetry(
    fullPrompt: string,
    sourceImageBytes: Buffer,
    sourceImageMimeType: string,
    durationSeconds: 5 | 10,
    attempt = 0,
  ): Promise<GeneratedVideoBytes> {
    try {
      return await this.requestVideo(fullPrompt, sourceImageBytes, sourceImageMimeType, durationSeconds);
    } catch (error) {
      if (attempt < MAX_IMAGE_ATTEMPTS - 1 && isRetryableProviderError(error)) {
        await sleep(this.retryDelayMs(attempt));
        return this.requestVideoWithRetry(
          fullPrompt,
          sourceImageBytes,
          sourceImageMimeType,
          durationSeconds,
          attempt + 1,
        );
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
    sourceImageBytes: Buffer,
    sourceImageMimeType: string,
    durationSeconds: 5 | 10,
  ): Promise<GeneratedVideoBytes> {
    const startImageUrl = await this.uploadSourceImage(sourceImageBytes, sourceImageMimeType);
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

    const response = await fetch(videoUrl, { signal: AbortSignal.timeout(this.requestTimeoutMs) });
    if (!response.ok) {
      throw new Error('Failed to download generated video.');
    }
    const mimeType = contentType ?? response.headers.get('content-type') ?? 'video/mp4';
    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      mimeType,
      prompt: fullPrompt,
      model: KLING_I2V_ENDPOINT,
      durationSeconds,
    };
  }
}

function humanizeVideoError(error: unknown): string {
  if (!error || typeof error !== 'object') return 'The video provider returned an error.';
  const record = error as {
    message?: string;
    status?: number;
    body?: { detail?: string };
  };
  const message = record.body?.detail ?? record.message ?? String(error);
  if (/timed out|timeout|ETIMEDOUT|AbortError/i.test(message)) {
    return 'The video provider took too long to respond. Try again.';
  }
  if (/billing|quota|insufficient|credit/i.test(message)) {
    return 'fal.ai video generation is blocked by billing or quota. Add credit, then retry.';
  }
  if (/content.?policy|safety|nsfw/i.test(message)) {
    return 'fal.ai refused this motion prompt. Edit the scene and retry.';
  }
  if (/api key|unauthorized|401|403/i.test(message)) {
    return 'fal.ai rejected the API key.';
  }
  return message;
}
