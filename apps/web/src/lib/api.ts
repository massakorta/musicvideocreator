import { PRODUCT_NAME } from '@music-video/shared';

const jsonHeaders = { 'Content-Type': 'application/json' };
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10 * 60 * 1000);
  const onAbort = () => controller.abort();
  init?.signal?.addEventListener('abort', onAbort);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      ...init,
      signal: controller.signal,
      headers: {
        ...(init?.body instanceof FormData ? {} : jsonHeaders),
        ...init?.headers,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiClientError('TIMEOUT', `${PRODUCT_NAME} took too long to respond. Try again.`, 408);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
    init?.signal?.removeEventListener('abort', onAbort);
  }
  if (response.status === 204) return undefined as T;
  const data = (await response.json().catch(() => ({}))) as {
    code?: string;
    message?: string;
    details?: unknown;
  };
  if (!response.ok) {
    throw new ApiClientError(
      data.code ?? 'INTERNAL',
      data.message ?? `${PRODUCT_NAME} could not complete that request.`,
      response.status,
      data.details,
    );
  }
  return data as T;
}

export const api = {
  session: () =>
    request<{
      authenticated: boolean;
      accessRequired: boolean;
      demoMode: boolean;
      openaiConfigured: boolean;
      falConfigured: boolean;
      imagesDemoMode: boolean;
      supabaseConfigured: boolean;
    }>('/api/auth/session'),
  access: (code: string) => request('/api/auth/access', { method: 'POST', body: JSON.stringify({ code }) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  projects: () => request<{ projects: import('@music-video/shared').ProjectSummary[] }>('/api/projects'),
  createProject: (body: { name?: string; songTitle?: string; lyrics?: string }) =>
    request<{ project: import('@music-video/shared').MusicVideoProject }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  project: (id: string) =>
    request<{
      project: import('@music-video/shared').MusicVideoProject;
      health: import('@music-video/shared').ProjectHealth;
      timingIssues: import('@music-video/shared').TimelineIssue[];
      pipeline: import('@music-video/shared').PipelineStatus;
      stale: import('@music-video/shared').StaleAssets;
    }>(`/api/projects/${id}`),
  patchProject: (id: string, body: unknown) =>
    request<{ project: import('@music-video/shared').MusicVideoProject; health: import('@music-video/shared').ProjectHealth }>(
      `/api/projects/${id}`,
      { method: 'PATCH', body: JSON.stringify(body) },
    ),
  deleteProject: (id: string) => request(`/api/projects/${id}`, { method: 'DELETE' }),
  duplicateProject: (id: string) =>
    request<{ project: import('@music-video/shared').MusicVideoProject }>(`/api/projects/${id}/duplicate`, {
      method: 'POST',
    }),
  uploadAudio: (id: string, file: File, durationSeconds?: number) => {
    const body = new FormData();
    body.append('file', file);
    if (durationSeconds) body.append('durationSeconds', String(durationSeconds));
    return request<{ project: import('@music-video/shared').MusicVideoProject; durationDetected: boolean }>(
      `/api/projects/${id}/audio`,
      { method: 'POST', body, headers: {} },
    );
  },
  importSunoAudio: (id: string, url: string) =>
    request<{
      project: import('@music-video/shared').MusicVideoProject;
      durationDetected: boolean;
      title?: string;
    }>(`/api/projects/${id}/audio/suno`, {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),
  setDuration: (id: string, durationSeconds: number) =>
    request(`/api/projects/${id}/duration`, { method: 'POST', body: JSON.stringify({ durationSeconds }) }),
  generateBible: (id: string) =>
    request<{ project: import('@music-video/shared').MusicVideoProject; demo: boolean }>(
      `/api/projects/${id}/visual-bible/generate`,
      { method: 'POST' },
    ),
  patchBible: (id: string, body: unknown) =>
    request<{ project: import('@music-video/shared').MusicVideoProject }>(`/api/projects/${id}/visual-bible`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  characterRef: (id: string, characterId: string, force = false) =>
    request<{ project: import('@music-video/shared').MusicVideoProject; demo: boolean }>(
      `/api/projects/${id}/characters/${characterId}/reference`,
      { method: 'POST', body: JSON.stringify({ force }) },
    ),
  approveCharacter: (id: string, characterId: string, locked = true) =>
    request<{ project: import('@music-video/shared').MusicVideoProject }>(
      `/api/projects/${id}/characters/${characterId}/approve`,
      { method: 'POST', body: JSON.stringify({ locked }) },
    ),
  generateStoryboard: (id: string) =>
    request<{ project: import('@music-video/shared').MusicVideoProject; demo: boolean }>(
      `/api/projects/${id}/storyboard/generate`,
      { method: 'POST' },
    ),
  patchScene: (id: string, sceneId: string, body: unknown) =>
    request<{ project: import('@music-video/shared').MusicVideoProject; health: import('@music-video/shared').ProjectHealth }>(
      `/api/projects/${id}/scenes/${sceneId}`,
      { method: 'PATCH', body: JSON.stringify(body) },
    ),
  addScene: (id: string, afterSceneId?: string) =>
    request<{ project: import('@music-video/shared').MusicVideoProject }>(`/api/projects/${id}/scenes`, {
      method: 'POST',
      body: JSON.stringify({ afterSceneId }),
    }),
  deleteScene: (id: string, sceneId: string) =>
    request<{ project: import('@music-video/shared').MusicVideoProject }>(`/api/projects/${id}/scenes/${sceneId}`, {
      method: 'DELETE',
    }),
  duplicateScene: (id: string, sceneId: string) =>
    request<{ project: import('@music-video/shared').MusicVideoProject }>(
      `/api/projects/${id}/scenes/${sceneId}/duplicate`,
      { method: 'POST' },
    ),
  generateSceneImage: (id: string, sceneId: string, force = false) =>
    request<{ project: import('@music-video/shared').MusicVideoProject; demo: boolean }>(
      `/api/projects/${id}/scenes/${sceneId}/image`,
      { method: 'POST', body: JSON.stringify({ force }) },
    ),
  generateSceneVideo: (id: string, sceneId: string, force = false) =>
    request<{ project: import('@music-video/shared').MusicVideoProject; demo: boolean; started: boolean }>(
      `/api/projects/${id}/scenes/${sceneId}/video`,
      { method: 'POST', body: JSON.stringify({ force }) },
    ),
  uploadSceneImage: (id: string, sceneId: string, file: File) => {
    const body = new FormData();
    body.append('file', file);
    return request<{ project: import('@music-video/shared').MusicVideoProject }>(
      `/api/projects/${id}/scenes/${sceneId}/image/upload`,
      { method: 'POST', body, headers: {} },
    );
  },
  restoreSceneImage: (id: string, sceneId: string, assetId: string) =>
    request<{ project: import('@music-video/shared').MusicVideoProject }>(
      `/api/projects/${id}/scenes/${sceneId}/image/restore`,
      { method: 'POST', body: JSON.stringify({ assetId }) },
    ),
  generateMissing: (id: string) =>
    request<{ project: import('@music-video/shared').MusicVideoProject }>(`/api/projects/${id}/images/generate-missing`, {
      method: 'POST',
    }),
  generateAll: (id: string) =>
    request<{ job: import('@music-video/shared').PipelineJob }>(`/api/projects/${id}/generate-all`, {
      method: 'POST',
    }),
  regenerateStale: (id: string) =>
    request<{ job: import('@music-video/shared').PipelineJob }>(`/api/projects/${id}/regenerate-stale`, {
      method: 'POST',
    }),
  pipeline: (id: string) =>
    request<import('@music-video/shared').PipelineStatus & { stale: import('@music-video/shared').StaleAssets }>(
      `/api/projects/${id}/pipeline`,
    ),
  share: (id: string) => request<{ shareId: string; url: string }>(`/api/projects/${id}/share`, { method: 'POST' }),
  publicWatch: (shareId: string) =>
    request<{
      watch: {
        title: string;
        songTitle: string;
        durationSeconds: number;
        shareId: string;
        mode: 'preview' | 'video';
        videoUrl?: string;
        preview?: {
          composition: import('@music-video/video').CompositionProject;
          durationInFrames: number;
          fps: number;
          width: number;
          height: number;
          audioUrl?: string;
        };
        lyrics?: {
          text: string;
          lines: Array<{
            startTime: number;
            endTime: number;
            text: string;
            section: string;
          }>;
        };
      };
    }>(`/api/public/watch/${shareId}`),
  render: (id: string) =>
    request<{ project: import('@music-video/shared').MusicVideoProject; job: import('@music-video/shared').RenderJob }>(
      `/api/projects/${id}/render`,
      { method: 'POST' },
    ),
  job: (jobId: string) =>
    request<{ job: import('@music-video/shared').RenderJob }>(`/api/render-jobs/${jobId}`),
  jobs: (id: string) =>
    request<{ jobs: import('@music-video/shared').RenderJob[] }>(`/api/projects/${id}/render-jobs`),
};
