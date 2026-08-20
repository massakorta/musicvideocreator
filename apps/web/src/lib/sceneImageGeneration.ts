import { MAX_STAGE_ATTEMPTS, providerRetryDelayMs, sleep } from '@music-video/shared';
import { api, ApiClientError } from './api';

function isRetryableSceneImageError(error: unknown): boolean {
  if (!(error instanceof ApiClientError)) return false;
  return error.status === 409 || error.status === 429 || error.status === 502 || error.status === 503 || error.status === 504;
}

export async function generateSceneImageWithRetry(
  projectId: string,
  sceneId: string,
  force = false,
): Promise<Awaited<ReturnType<typeof api.generateSceneImage>>> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_STAGE_ATTEMPTS; attempt += 1) {
    try {
      return await api.generateSceneImage(projectId, sceneId, force);
    } catch (error) {
      lastError = error;
      if (attempt >= MAX_STAGE_ATTEMPTS - 1 || !isRetryableSceneImageError(error)) throw error;
      await sleep(providerRetryDelayMs(attempt));
    }
  }
  throw lastError;
}
