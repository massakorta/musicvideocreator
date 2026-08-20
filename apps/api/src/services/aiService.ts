import { createOpenAiClient, FalImageProvider, generateStoryboard, generateVisualBible, isOpenAiConfigured } from '@music-video/ai';
import { AppError, ERROR_CODES, getImageQuality, visualBibleSchema, type AiUsageLog, type ImageQualityId, type VisualBible } from '@music-video/shared';
import { config, falConfigured, openaiConfigured } from '../config.js';
import { getRepositories } from '../repositories/index.js';
import { demoStoryboard, demoVisualBible } from './demo.js';
import { ensureTranscribedLyrics } from './lyricSync.js';
import { getProjectOrThrow, saveProject, styleOrThrow } from './projects.js';
import { newId, nowIso, touch } from './projectUtils.js';

export function requireOpenAiOrDemo(): 'live' | 'demo' {
  return openaiConfigured() && isOpenAiConfigured(config.openaiApiKey) ? 'live' : 'demo';
}

export function requireFalOrDemo(): 'live' | 'demo' {
  return falConfigured() ? 'live' : 'demo';
}

export async function generateProjectVisualBible(projectId: string): Promise<{ project: Awaited<ReturnType<typeof getProjectOrThrow>>; demo: boolean }> {
  let project = await getProjectOrThrow(projectId);
  if (!project.audio) {
    throw new AppError(ERROR_CODES.VALIDATION, 'Upload a song before generating a visual bible.', 400);
  }
  const transcribed = await ensureTranscribedLyrics(project);
  project = transcribed.project;
  const style = styleOrThrow(project.styleId);
  const log = startLog('visual_bible', projectId, config.openaiTextModel);
  try {
    if (requireOpenAiOrDemo() === 'demo') {
      const bible = preserveLockedCharacters(demoVisualBible(project.name, style, project.lyrics), project.visualBible);
      const saved = await saveProject(
        touch(project, { visualBible: bible, visualBibleApproved: false, status: 'visual_bible' }),
      );
      await finishLog(log, 'success');
      return { project: saved, demo: true };
    }
    const client = createOpenAiClient({
      apiKey: config.openaiApiKey,
      textModel: config.openaiTextModel,
    });
    const { bible, usage } = await generateVisualBible({
      client,
      model: config.openaiTextModel,
      projectTitle: project.name,
      lyrics: project.lyrics,
      durationSeconds: project.durationSeconds || 180,
      style,
    });
    const merged = preserveLockedCharacters(bible, project.visualBible);
    visualBibleSchema.parse(merged);
    const saved = await saveProject(
      touch(project, { visualBible: merged, visualBibleApproved: false, status: 'visual_bible' }),
    );
    await finishLog(log, 'success', usage);
    return { project: saved, demo: false };
  } catch (error) {
    await finishLog(log, 'error', undefined, error);
    throw wrapAiError(error, 'The visual bible could not be generated.');
  }
}

export async function patchVisualBible(projectId: string, patch: Partial<VisualBible> & { approved?: boolean }) {
  const project = await getProjectOrThrow(projectId);
  if (!project.visualBible) {
    throw new AppError(ERROR_CODES.VALIDATION, 'Generate a visual bible first.', 400);
  }
  const { approved, ...rest } = patch;
  const nextBible = visualBibleSchema.parse({
    ...project.visualBible,
    ...rest,
    overallStyle: { ...project.visualBible.overallStyle, ...rest.overallStyle },
    characters: rest.characters ?? project.visualBible.characters,
    environments: rest.environments ?? project.visualBible.environments,
  });
  return saveProject(
    touch(project, {
      visualBible: nextBible,
      visualBibleApproved: approved ?? project.visualBibleApproved,
    }),
  );
}

export async function generateProjectStoryboard(projectId: string) {
  let project = await getProjectOrThrow(projectId);
  if (!project.visualBible || !project.visualBibleApproved) {
    throw new AppError(ERROR_CODES.VALIDATION, 'Approve the visual bible before generating a storyboard.', 400);
  }
  const visualBible = project.visualBible;
  if (!project.durationSeconds) {
    throw new AppError(ERROR_CODES.VALIDATION, 'Song duration is unknown. Re-upload the audio or set duration.', 400);
  }
  const style = styleOrThrow(project.styleId);
  const log = startLog('storyboard', projectId, config.openaiTextModel);
  try {
    const transcribed = await ensureTranscribedLyrics(project);
    project = transcribed.project;
    const alignment = transcribed.alignment;
    if (requireOpenAiOrDemo() === 'demo') {
      const scenes = demoStoryboard(project.durationSeconds, visualBible, project.lyrics, style, alignment);
      const saved = await saveProject(touch(project, { scenes, status: 'storyboard', lyricAlignment: alignment }));
      await finishLog(log, 'success');
      return { project: saved, demo: true };
    }
    const client = createOpenAiClient({
      apiKey: config.openaiApiKey,
      textModel: config.openaiTextModel,
    });
    const { scenes, usage } = await generateStoryboard({
      client,
      model: config.openaiTextModel,
      projectTitle: project.name,
      lyrics: project.lyrics,
      durationSeconds: project.durationSeconds,
      style,
      bible: visualBible,
      alignment,
    });
    const saved = await saveProject(touch(project, { scenes, status: 'storyboard', lyricAlignment: alignment }));
    await finishLog(log, 'success', usage);
    return { project: saved, demo: false };
  } catch (error) {
    await finishLog(log, 'error', undefined, error);
    throw wrapAiError(error, 'The storyboard could not be generated.');
  }
}

export function createImageProvider(imageQualityId?: ImageQualityId): FalImageProvider | null {
  if (!falConfigured()) return null;
  const preset = getImageQuality(imageQualityId);
  return new FalImageProvider(preset, {
    requestTimeoutMs: 180_000,
    credentials: config.falKey,
  });
}

function preserveLockedCharacters(next: VisualBible, previous?: VisualBible): VisualBible {
  if (!previous) return next;
  const locked = new Map(previous.characters.filter((c) => c.lockedReferenceImage).map((c) => [c.id, c]));
  return {
    ...next,
    characters: next.characters.map((character) => locked.get(character.id) ?? character),
  };
}

function startLog(operation: string, projectId: string, model: string): AiUsageLog {
  return {
    id: newId(),
    operation,
    projectId,
    provider: 'openai',
    model,
    status: 'started',
    startedAt: nowIso(),
  };
}

async function finishLog(
  log: AiUsageLog,
  status: 'success' | 'error',
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number },
  error?: unknown,
) {
  await getRepositories().aiLogs.add({
    ...log,
    status,
    completedAt: nowIso(),
    promptTokens: usage?.prompt_tokens,
    completionTokens: usage?.completion_tokens,
    totalTokens: usage?.total_tokens,
    error: status === 'error' ? (error instanceof Error ? error.message : String(error)) : undefined,
  });
}

function wrapAiError(error: unknown, fallback: string): AppError {
  if (error instanceof AppError) return error;
  const message = error instanceof Error ? error.message : fallback;
  if (/api key|401|incorrect/i.test(message)) {
    return new AppError(ERROR_CODES.OPENAI_FAILED, 'OpenAI rejected the API key. Check OPENAI_API_KEY.', 502);
  }
  if (/model/i.test(message) && /not found|does not exist|invalid/i.test(message)) {
    return new AppError(
      ERROR_CODES.OPENAI_FAILED,
      `The configured text model is not available on this OpenAI account. Set OPENAI_TEXT_MODEL to a model you can use (for example gpt-4o).`,
      502,
    );
  }
  return new AppError(ERROR_CODES.OPENAI_FAILED, message || fallback, 502);
}
