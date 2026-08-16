import { randomUUID } from 'node:crypto';
import {
  computeProjectHealth,
  PROJECT_STATUS_LABELS,
  reindexScenes,
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

export function deriveStatus(project: MusicVideoProject): ProjectStatus {
  if (project.status === 'rendering') return 'rendering';
  if (project.status === 'error' && project.lastError) return 'error';
  if (!project.audio || !project.lyrics.trim() || !project.styleId) return 'setup';
  if (!project.visualBible || !project.visualBibleApproved) return 'visual_bible';
  if (project.scenes.length === 0) return 'storyboard';
  const generating = project.scenes.some((s) => s.generationState === 'generating');
  if (generating) return 'generating_images';
  const health = computeProjectHealth(project);
  if (project.status === 'complete' && health.readyToRender) return 'complete';
  if (health.readyToRender) return 'ready_to_render';
  if (project.scenes.some((s) => s.currentAssetId || s.image)) return 'editing';
  return 'storyboard';
}

export function toSummary(project: MusicVideoProject): ProjectSummary {
  const health = computeProjectHealth(project);
  const steps = [
    Boolean(project.audio && project.lyrics.trim()),
    Boolean(project.styleId),
    Boolean(project.visualBibleApproved),
    project.scenes.length > 0,
    health.imagesGenerated > 0 && health.imagesGenerated === health.imagesTotal,
    health.readyToRender || project.status === 'complete',
  ];
  const completed = steps.filter(Boolean).length;
  return {
    id: project.id,
    name: project.name,
    songTitle: project.songTitle,
    thumbnailUrl: project.thumbnailUrl,
    durationSeconds: project.durationSeconds,
    status: project.status,
    updatedAt: project.updatedAt,
    progress: Math.round((completed / steps.length) * 100),
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

export { PROJECT_STATUS_LABELS };
