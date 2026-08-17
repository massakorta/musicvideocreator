import {
  computeProjectHealth,
  computeStaleAssets,
  errorText,
  isRetryableProviderError,
  MAX_STAGE_ATTEMPTS,
  nextPipelineRequeueMarker,
  pipelineRequeueCount,
  providerRetryDelayMs,
  shouldRequeuePipeline,
  withRetries,
  type PipelineJob,
  type PipelineStage,
} from '@music-video/shared';
import { config } from '../../api/src/config.js';
import { getRepositories } from '../../api/src/repositories/index.js';
import {
  generateProjectStoryboard,
  generateProjectVisualBible,
} from '../../api/src/services/aiService.js';
import {
  approveCharacterReference,
  generateCharacterReference,
  generateSceneImage,
} from '../../api/src/services/images.js';
import { patchPipelineJob, ensureShareId } from '../../api/src/services/pipeline.js';
import { getProjectOrThrow, saveProject } from '../../api/src/services/projects.js';

export interface PipelineRunOptions {}

async function updateStage(job: PipelineJob, stage: PipelineStage, patch: Partial<PipelineJob> = {}): Promise<PipelineJob> {
  return patchPipelineJob(job, { stage, ...patch });
}

function characterIdsNeedingGeneration(
  project: Awaited<ReturnType<typeof getProjectOrThrow>>,
  stale: ReturnType<typeof computeStaleAssets>,
): string[] {
  const missing =
    project.visualBible?.characters.filter((c) => !c.referenceAssetId).map((c) => c.id) ?? [];
  return [...new Set([...missing, ...stale.staleCharacterIds])];
}

function sceneIdsNeedingGeneration(
  project: Awaited<ReturnType<typeof getProjectOrThrow>>,
  stale: ReturnType<typeof computeStaleAssets>,
): string[] {
  const missing = project.scenes.filter((s) => !s.currentAssetId && !s.image).map((s) => s.id);
  return [...new Set([...missing, ...stale.staleSceneIds])];
}

export async function runPipelineJob(job: PipelineJob, options?: PipelineRunOptions): Promise<'complete' | 'requeued'> {
  let current = await patchPipelineJob(job, { status: 'running', startedAt: job.startedAt ?? new Date().toISOString() });
  const projectId = job.projectId;

  try {
    if (job.kind === 'full') {
      await runFullPipeline(current, options);
    } else {
      await runStalePipeline(current, options);
    }
    const finished = await getRepositories().pipelineJobs.get(job.id);
    if (!finished) return 'complete';
    current = finished;
    await patchPipelineJob(current, {
      status: 'complete',
      progress: 100,
      completedAt: new Date().toISOString(),
      stageDetail: 'Done',
      error: undefined,
    });
    const project = await getProjectOrThrow(projectId);
    await saveProject({ ...project, status: 'complete', lastError: undefined });
    await ensureShareId(projectId);
    return 'complete';
  } catch (error) {
    const message = errorText(error);
    current = (await getRepositories().pipelineJobs.get(job.id)) ?? current;
    const requeues = pipelineRequeueCount(current.error);
    if (shouldRequeuePipeline(error, requeues)) {
      const marker = nextPipelineRequeueMarker(current.error);
      console.warn(`[worker] requeuing pipeline ${job.id} (${marker}) after: ${message}`);
      await patchPipelineJob(current, {
        status: 'queued',
        claimedBy: undefined,
        startedAt: undefined,
        completedAt: undefined,
        error: marker,
        stageDetail: 'Retrying after a temporary error…',
      });
      return 'requeued';
    }
    await patchPipelineJob(current, {
      status: 'failed',
      error: message,
      completedAt: new Date().toISOString(),
    });
    const project = await getProjectOrThrow(projectId);
    await saveProject({ ...project, status: 'error', lastError: message });
    throw error;
  }
}

async function runFullPipeline(job: PipelineJob, options?: PipelineRunOptions): Promise<void> {
  let current = job;
  let project = await getProjectOrThrow(current.projectId);
  const skipBible = Boolean(project.visualBible && project.visualBibleApproved);
  const skipStoryboard = project.scenes.length > 0;
  let stale = computeStaleAssets(project);
  let characterIdsToGenerate = characterIdsNeedingGeneration(project, stale);
  let sceneIdsToGenerate = sceneIdsNeedingGeneration(project, stale);
  const characters = project.visualBible?.characters ?? [];

  const isResume =
    skipBible ||
    skipStoryboard ||
    (characters.length > 0 && characterIdsToGenerate.length === 0) ||
    (project.scenes.length > 0 && sceneIdsToGenerate.length === 0);
  if (isResume) {
    const skipped: string[] = [];
    if (skipBible) skipped.push('bible');
    if (skipStoryboard) skipped.push('storyboard');
    console.log(
      `[worker] resuming full pipeline job=${job.id} project=${job.projectId}` +
        (skipped.length ? `, skipping ${skipped.join('/')}` : '') +
        `, ${characterIdsToGenerate.length} characters and ${sceneIdsToGenerate.length} images to generate`,
    );
  }

  if (!skipBible) {
    current = await updateStage(current, 'bible', { stageDetail: 'Writing the visual world…', progress: 2 });
    const bibleResult = await runStage('visual bible', () => generateProjectVisualBible(current.projectId));
    project = bibleResult.project;
    if (project.visualBible) {
      project = await saveProject({
        ...project,
        visualBibleApproved: true,
        status: 'visual_bible',
      });
    }
    current = await patchPipelineJob(current, { progress: 10, stageDetail: 'Visual bible ready' });
  } else {
    current = await patchPipelineJob(current, { progress: 10, stageDetail: 'Visual bible ready' });
  }

  project = await getProjectOrThrow(current.projectId);
  stale = computeStaleAssets(project);
  characterIdsToGenerate = characterIdsNeedingGeneration(project, stale);
  const charactersAfterBible = project.visualBible?.characters ?? [];

  if (characterIdsToGenerate.length > 0) {
    current = await updateStage(current, 'characters', {
      charactersTotal: characterIdsToGenerate.length,
      charactersDone: 0,
      stageDetail: 'Painting character references…',
      progress: 12,
    });
    await generateCharacterBatch(
      current,
      characterIdsToGenerate,
      async (done) => {
        const characterId = characterIdsToGenerate[done - 1];
        const character = characterId
          ? charactersAfterBible.find((c) => c.id === characterId)
          : undefined;
        current = await patchPipelineJob(current, {
          charactersDone: done,
          stageDetail: character
            ? `Character ${done} of ${characterIdsToGenerate.length}: ${character.name}`
            : `Character ${done} of ${characterIdsToGenerate.length}`,
        });
      },
    );
    project = await getProjectOrThrow(current.projectId);
  } else {
    current = await patchPipelineJob(current, {
      charactersTotal: charactersAfterBible.length,
      charactersDone: charactersAfterBible.length,
      progress: 28,
      stageDetail: charactersAfterBible.length ? 'Character references ready' : 'No characters to paint',
    });
  }

  if (!skipStoryboard) {
    current = await updateStage(current, 'storyboard', {
      stageDetail: 'Listening to the song and lining up the lyrics…',
      progress: 28,
    });
    const storyboardResult = await runStage('storyboard', () => generateProjectStoryboard(current.projectId));
    project = storyboardResult.project;
    const sceneCount = project.scenes.length;
    current = await patchPipelineJob(current, {
      progress: 35,
      imagesTotal: sceneCount,
      imagesDone: 0,
      stageDetail: `${sceneCount} scenes storyboarded`,
    });
  } else {
    const sceneCount = project.scenes.length;
    current = await patchPipelineJob(current, {
      progress: 35,
      imagesTotal: sceneCount,
      imagesDone: project.scenes.filter((s) => s.currentAssetId || s.image).length,
      stageDetail: `${sceneCount} scenes storyboarded`,
    });
  }

  project = await getProjectOrThrow(current.projectId);
  stale = computeStaleAssets(project);
  sceneIdsToGenerate = sceneIdsNeedingGeneration(project, stale);

  if (sceneIdsToGenerate.length > 0) {
    current = await updateStage(current, 'images', {
      imagesTotal: sceneIdsToGenerate.length,
      imagesDone: 0,
      stageDetail: 'Generating scene stills…',
    });
    await generateSceneBatch(current, sceneIdsToGenerate);
  } else {
    current = await patchPipelineJob(current, {
      imagesTotal: project.scenes.length,
      imagesDone: project.scenes.length,
      stageDetail: 'Scene stills ready',
    });
  }

  project = await getProjectOrThrow(current.projectId);
  const health = computeProjectHealth(project);
  if (!health.readyToRender) {
    throw new Error(health.blockers[0] || 'Project is not ready to share.');
  }

  current = (await getRepositories().pipelineJobs.get(current.id)) ?? current;
  await ensureShareId(current.projectId);
  await patchPipelineJob(current, { progress: 100, stageDetail: 'Ready to share' });
}

async function runStalePipeline(job: PipelineJob, _options?: PipelineRunOptions): Promise<void> {
  let current = job;
  let project = await getProjectOrThrow(current.projectId);
  const stale = computeStaleAssets(project);

  if (stale.staleCharacterIds.length > 0) {
    current = await updateStage(current, 'characters', {
      charactersTotal: stale.staleCharacterIds.length,
      charactersDone: 0,
      stageDetail: 'Updating character references…',
    });
    await generateCharacterBatch(current, stale.staleCharacterIds, async (done) => {
      const characterId = stale.staleCharacterIds[done - 1];
      project = await getProjectOrThrow(current.projectId);
      const character = characterId ? project.visualBible?.characters.find((c) => c.id === characterId) : undefined;
      current = await patchPipelineJob(current, {
        charactersDone: done,
        stageDetail: character ? `Character: ${character.name}` : `Character ${done}`,
      });
    });
    project = await getProjectOrThrow(current.projectId);
  }

  if (stale.staleSceneIds.length > 0) {
    current = await updateStage(current, 'images', {
      imagesTotal: stale.staleSceneIds.length,
      imagesDone: 0,
      stageDetail: 'Updating changed scene stills…',
    });
    await generateSceneBatch(current, stale.staleSceneIds);
  }

  project = await getProjectOrThrow(current.projectId);
  const health = computeProjectHealth(project);
  if (!health.readyToRender) {
    throw new Error(health.blockers[0] || 'Project is not ready to share.');
  }

  current = (await getRepositories().pipelineJobs.get(current.id)) ?? current;
  await ensureShareId(current.projectId);
  await patchPipelineJob(current, { progress: 100, stageDetail: 'Ready to share' });
}

async function runStage<T>(label: string, operation: () => Promise<T>): Promise<T> {
  return withRetries(operation, {
    attempts: MAX_STAGE_ATTEMPTS,
    retryIf: isRetryableProviderError,
    delayMs: (attempt) => providerRetryDelayMs(attempt),
    onRetry: (error, attempt) => {
      console.warn(`[worker] ${label} failed (attempt ${attempt + 1}/${MAX_STAGE_ATTEMPTS}): ${errorText(error)}`);
    },
  });
}

async function generateCharacterBatch(
  job: PipelineJob,
  characterIds: string[],
  onProgress?: (done: number) => Promise<void>,
): Promise<void> {
  if (characterIds.length === 0) return;
  const concurrency = Math.max(1, config.imageConcurrency);
  let remaining = [...characterIds];
  let done = characterIds.length - remaining.length;

  for (let pass = 0; pass < MAX_STAGE_ATTEMPTS && remaining.length > 0; pass += 1) {
    const failed: string[] = [];
    let cursor = 0;
    const passIds = remaining;

    async function worker() {
      while (cursor < passIds.length) {
        const index = cursor;
        cursor += 1;
        const characterId = passIds[index];
        if (!characterId) return;
        try {
          await generateCharacterReference(job.projectId, characterId, true);
          await approveCharacterReference(job.projectId, characterId, true);
          done += 1;
          if (onProgress) await onProgress(done);
        } catch (error) {
          console.warn(
            `[worker] character ${characterId} failed (pass ${pass + 1}/${MAX_STAGE_ATTEMPTS}): ${errorText(error)}`,
          );
          failed.push(characterId);
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, passIds.length) }, () => worker()));
    remaining = failed;
    if (remaining.length > 0 && pass < MAX_STAGE_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, providerRetryDelayMs(pass)));
    }
  }

  if (remaining.length > 0) {
    console.warn(
      `[worker] continuing pipeline ${job.id} without ${remaining.length} character reference${remaining.length === 1 ? '' : 's'}`,
    );
  }
}

async function generateSceneBatch(job: PipelineJob, sceneIds: string[]): Promise<void> {
  const concurrency = Math.max(1, config.imageConcurrency);
  let remaining = [...sceneIds];
  let done = 0;

  for (let pass = 0; pass < MAX_STAGE_ATTEMPTS && remaining.length > 0; pass += 1) {
    const failed: string[] = [];
    let cursor = 0;
    const passIds = remaining;

    async function worker() {
      while (cursor < passIds.length) {
        const index = cursor;
        cursor += 1;
        const sceneId = passIds[index];
        if (!sceneId) return;
        try {
          await generateSceneImage(job.projectId, sceneId, true);
          done += 1;
          await patchPipelineJob(job, {
            imagesDone: done,
            stageDetail: `Scene still ${done} of ${sceneIds.length}`,
          });
        } catch (error) {
          console.warn(`[worker] scene ${sceneId} failed (pass ${pass + 1}/${MAX_STAGE_ATTEMPTS}): ${errorText(error)}`);
          failed.push(sceneId);
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, passIds.length) }, () => worker()));
    remaining = failed;
    if (remaining.length > 0 && pass < MAX_STAGE_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, providerRetryDelayMs(pass)));
    }
  }

  if (remaining.length > Math.max(1, Math.floor(sceneIds.length * 0.5))) {
    throw new Error(`${remaining.length} scene images failed. The worker will retry the job.`);
  }
}
