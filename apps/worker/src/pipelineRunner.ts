import {
  characterReferenceFingerprint,
  computeProjectHealth,
  renderCompositionFingerprint,
  sceneImageFingerprint,
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
import { enqueueRender, getRenderJob } from '../../api/src/services/render.js';
import { markRenderFingerprint } from '../../api/src/services/share.js';
import { computeStaleAssets } from '@music-video/shared';

async function waitForRender(renderJobId: string, onProgress: (progress: number) => void): Promise<void> {
  for (;;) {
    const job = await getRenderJob(renderJobId);
    onProgress(job.progress);
    if (job.status === 'complete') return;
    if (job.status === 'failed') {
      throw new Error(job.error || 'Render failed.');
    }
    await new Promise((r) => setTimeout(r, config.workerPollMs));
  }
}

async function updateStage(job: PipelineJob, stage: PipelineStage, patch: Partial<PipelineJob> = {}): Promise<PipelineJob> {
  return patchPipelineJob(job, { stage, ...patch });
}

export async function runPipelineJob(job: PipelineJob): Promise<void> {
  let current = await patchPipelineJob(job, { status: 'running', startedAt: job.startedAt ?? new Date().toISOString() });
  const projectId = job.projectId;

  try {
    if (job.kind === 'full') {
      await runFullPipeline(current);
    } else {
      await runStalePipeline(current);
    }
    const finished = await getRepositories().pipelineJobs.get(job.id);
    if (!finished) return;
    current = finished;
    await patchPipelineJob(current, {
      status: 'complete',
      progress: 100,
      completedAt: new Date().toISOString(),
      stageDetail: 'Done',
    });
    const project = await getProjectOrThrow(projectId);
    await saveProject({ ...project, status: 'complete', lastError: undefined });
    await ensureShareId(projectId);
    await markRenderFingerprint(projectId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Pipeline failed.';
    current = (await getRepositories().pipelineJobs.get(job.id)) ?? current;
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

async function runFullPipeline(job: PipelineJob): Promise<void> {
  let current = job;
  current = await updateStage(current, 'bible', { stageDetail: 'Writing the visual world…', progress: 2 });
  const bibleResult = await generateProjectVisualBible(current.projectId);
  let project = bibleResult.project;
  if (project.visualBible) {
    project = await saveProject({
      ...project,
      visualBibleApproved: true,
      status: 'visual_bible',
    });
  }
  current = await patchPipelineJob(current, { progress: 10, stageDetail: 'Visual bible ready' });

  const characters = project.visualBible?.characters ?? [];
  current = await updateStage(current, 'characters', {
    charactersTotal: characters.length,
    charactersDone: 0,
    stageDetail: characters.length ? 'Painting character references…' : 'No characters to paint',
    progress: 12,
  });
  await generateCharacterBatch(
    current,
    characters.map((c) => c.id),
    async (done) => {
      const character = characters[done - 1];
      current = await patchPipelineJob(current, {
        charactersDone: done,
        stageDetail: character
          ? `Character ${done} of ${characters.length}: ${character.name}`
          : `Character ${done} of ${characters.length}`,
      });
    },
  );
  project = await getProjectOrThrow(current.projectId);

  current = await updateStage(current, 'storyboard', {
    stageDetail: 'Listening to the song and lining up the lyrics…',
    progress: 28,
  });
  const storyboardResult = await generateProjectStoryboard(current.projectId);
  project = storyboardResult.project;
  const sceneCount = project.scenes.length;
  current = await patchPipelineJob(current, {
    progress: 35,
    imagesTotal: sceneCount,
    imagesDone: 0,
    stageDetail: `${sceneCount} scenes storyboarded`,
  });

  current = await updateStage(current, 'images', { stageDetail: 'Generating scene stills…' });
  await generateSceneBatch(current, project.scenes.map((s) => s.id));

    current = (await getRepositories().pipelineJobs.get(current.id)) ?? current;
    current = await updateStage(current, 'render', { stageDetail: 'Rendering the music video…', progress: 86 });
  const { job: renderJob } = await enqueueRender(current.projectId);
  current = await patchPipelineJob(current, { renderJobId: renderJob.id });
  await waitForRender(renderJob.id, (progress) => {
    void patchPipelineJob(current, {
      progress: 86 + Math.round(progress * 0.14),
      stageDetail: `Rendering frames (${progress}%)`,
    });
  });
}

async function runStalePipeline(job: PipelineJob): Promise<void> {
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
    throw new Error(health.blockers[0] || 'Project is not ready to render.');
  }

  current = (await getRepositories().pipelineJobs.get(current.id)) ?? current;
  current = await updateStage(current, 'render', { stageDetail: 'Rendering updated video…', progress: 86 });
  const { job: renderJob } = await enqueueRender(current.projectId);
  current = await patchPipelineJob(current, { renderJobId: renderJob.id });
  await waitForRender(renderJob.id, (progress) => {
    void patchPipelineJob(current, {
      progress: 86 + Math.round(progress * 0.14),
      stageDetail: `Rendering frames (${progress}%)`,
    });
  });
}

async function generateCharacterBatch(
  job: PipelineJob,
  characterIds: string[],
  onProgress?: (done: number) => Promise<void>,
): Promise<void> {
  if (characterIds.length === 0) return;
  const concurrency = Math.max(1, config.imageConcurrency);
  let cursor = 0;
  let done = 0;

  async function worker() {
    while (cursor < characterIds.length) {
      const index = cursor;
      cursor += 1;
      const characterId = characterIds[index];
      if (!characterId) return;
      await generateCharacterReference(job.projectId, characterId, true);
      let project = await getProjectOrThrow(job.projectId);
      await approveCharacterReference(job.projectId, characterId, true);
      project = await getProjectOrThrow(job.projectId);
      const updatedChar = project.visualBible?.characters.find((c) => c.id === characterId);
      if (updatedChar && project.visualBible) {
        const fp = characterReferenceFingerprint(
          updatedChar,
          project.styleId,
          project.visualBible.masterPrompt,
          project.visualBible.overallStyle,
        );
        const charactersNext = project.visualBible.characters.map((c) =>
          c.id === characterId ? { ...c, referenceFingerprint: fp } : c,
        );
        await saveProject({ ...project, visualBible: { ...project.visualBible, characters: charactersNext } });
      }
      done += 1;
      if (onProgress) await onProgress(done);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, characterIds.length) }, () => worker()));
}

async function generateSceneBatch(job: PipelineJob, sceneIds: string[]): Promise<void> {
  const concurrency = Math.max(1, config.imageConcurrency);
  let cursor = 0;
  let done = 0;
  let failures = 0;

  async function worker() {
    while (cursor < sceneIds.length) {
      const index = cursor;
      cursor += 1;
      const sceneId = sceneIds[index];
      if (!sceneId) return;
      try {
        await generateSceneImage(job.projectId, sceneId);
        const project = await getProjectOrThrow(job.projectId);
        const scene = project.scenes.find((s) => s.id === sceneId);
        if (scene) {
          const fp = sceneImageFingerprint(scene, project);
          const scenes = project.scenes.map((s) => (s.id === sceneId ? { ...s, imageFingerprint: fp } : s));
          await saveProject({ ...project, scenes });
        }
      } catch {
        failures += 1;
      }
      done += 1;
      await patchPipelineJob(job, {
        imagesDone: done,
        stageDetail: `Scene still ${done} of ${sceneIds.length}`,
      });
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, sceneIds.length) }, () => worker()));

  if (failures > Math.max(1, Math.floor(sceneIds.length * 0.5))) {
    throw new Error(`${failures} scene images failed. Open the editor to retry those scenes.`);
  }
}
