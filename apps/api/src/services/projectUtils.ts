import { randomUUID } from 'node:crypto';
import {
  completedEditorStepCount,
  computeProjectHealth,
  computeEtaAt,
  EDITOR_STEPS,
  nextEditorStep,
  PIPELINE_STAGE_LABELS,
  pipelineProgressFromJob,
  PROJECT_STATUS_LABELS,
  reindexScenes,
  type GenerationState,
  type MusicVideoProject,
  type ProjectStatus,
  type ProjectSummary,
  type ScenePatch,
  type StoryboardScene,
} from '@music-video/shared';

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return randomUUID();
}

export function touch(project: MusicVideoProject, patch: Partial<MusicVideoProject> = {}): MusicVideoProject {
  return { ...project, ...patch, updatedAt: nowIso() };
}

export function deriveStatus(project: MusicVideoProject, pipelineActive = false): ProjectStatus {
  if (pipelineActive) return 'generating_images';
  if (project.status === 'error' && project.lastError) return 'error';
  if (!project.audio || !project.styleId) return 'setup';
  if (!project.visualBible || !project.visualBibleApproved) return 'visual_bible';
  if (project.scenes.length === 0) return 'storyboard';
  const generating = project.scenes.some((s) => s.generationState === 'generating');
  if (generating) return 'generating_images';
  const health = computeProjectHealth(project);
  if (health.readyToRender) return 'complete';
  if (project.status === 'rendering' && !project.lastError) return 'rendering';
  if (project.scenes.some((s) => s.currentAssetId || s.image)) return 'editing';
  return 'storyboard';
}

export function toSummary(project: MusicVideoProject): ProjectSummary {
  const completed = completedEditorStepCount(project);
  return {
    id: project.id,
    name: project.name,
    songTitle: project.songTitle,
    thumbnailUrl: project.thumbnailUrl,
    durationSeconds: project.durationSeconds,
    status: project.status,
    updatedAt: project.updatedAt,
    progress: Math.round((completed / EDITOR_STEPS.length) * 100),
    nextStep: nextEditorStep(project),
  };
}

export function applyScenePatch(scene: StoryboardScene, patch: ScenePatch): StoryboardScene {
  const next = { ...scene, ...patch };
  if (patch.startTime !== undefined || patch.endTime !== undefined) {
    next.duration = Math.max(0, next.endTime - next.startTime);
  }
  return next;
}

export function replaceScenes(project: MusicVideoProject, scenes: StoryboardScene[]): MusicVideoProject {
  return touch(project, { scenes: reindexScenes(scenes) });
}

const GENERATION_RANK: Record<GenerationState, number> = {
  pending: 0,
  generating: 1,
  failed: 2,
  complete: 3,
};

/** Prefer the scene row that already has a finished still attached. */
export function mergeSceneState(previous: StoryboardScene, incoming: StoryboardScene): StoryboardScene {
  const previousComplete = Boolean(previous.currentAssetId) || previous.generationState === 'complete';
  const incomingComplete = Boolean(incoming.currentAssetId) || incoming.generationState === 'complete';

  if (previousComplete && !incomingComplete) {
    return {
      ...incoming,
      currentAssetId: previous.currentAssetId ?? incoming.currentAssetId,
      image: previous.image ?? incoming.image,
      previousAssetIds:
        previous.previousAssetIds.length >= incoming.previousAssetIds.length
          ? previous.previousAssetIds
          : incoming.previousAssetIds,
      generationState: 'complete',
      generationError: undefined,
      imageFingerprint: previous.imageFingerprint ?? incoming.imageFingerprint,
    };
  }

  if (
    previous.currentAssetId &&
    incoming.currentAssetId &&
    previous.currentAssetId !== incoming.currentAssetId &&
    GENERATION_RANK[incoming.generationState] >= GENERATION_RANK[previous.generationState]
  ) {
    return incoming;
  }

  if (previous.currentAssetId && !incoming.currentAssetId) {
    return {
      ...incoming,
      currentAssetId: previous.currentAssetId,
      image: previous.image,
      previousAssetIds:
        previous.previousAssetIds.length >= incoming.previousAssetIds.length
          ? previous.previousAssetIds
          : incoming.previousAssetIds,
      generationState: previous.generationState === 'complete' ? 'complete' : incoming.generationState,
      generationError: previous.generationState === 'complete' ? undefined : incoming.generationError,
      imageFingerprint: previous.imageFingerprint ?? incoming.imageFingerprint,
    };
  }

  if (
    GENERATION_RANK[previous.generationState] > GENERATION_RANK[incoming.generationState] &&
    incoming.generationState !== 'failed'
  ) {
    return {
      ...incoming,
      generationState: previous.generationState,
      generationError: previous.generationError,
      currentAssetId: previous.currentAssetId ?? incoming.currentAssetId,
      image: previous.image ?? incoming.image,
      previousAssetIds:
        previous.previousAssetIds.length >= incoming.previousAssetIds.length
          ? previous.previousAssetIds
          : incoming.previousAssetIds,
      imageFingerprint: previous.imageFingerprint ?? incoming.imageFingerprint,
    };
  }

  return incoming;
}

/** Merge concurrent project writes so completed stills are never dropped. */
export function mergeProjectDocuments(
  current: MusicVideoProject,
  incoming: MusicVideoProject,
): MusicVideoProject {
  const previousScenes = new Map(current.scenes.map((scene) => [scene.id, scene]));
  const mergedScenes = incoming.scenes.map((scene) => {
    const previous = previousScenes.get(scene.id);
    return previous ? mergeSceneState(previous, scene) : scene;
  });
  return { ...incoming, scenes: mergedScenes };
}

export { PROJECT_STATUS_LABELS };
