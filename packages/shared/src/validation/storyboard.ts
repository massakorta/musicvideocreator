import type { StoryboardScene } from '../storyboard.js';
import type { CharacterDefinition, VisualBible } from '../visualBible.js';
import type { MusicVideoProject, ProjectHealth } from '../project.js';
import { roundTime } from '../lyrics.js';

export interface TimelineIssue {
  type: 'gap' | 'overlap' | 'negative_duration' | 'out_of_range' | 'order';
  sceneId?: string;
  message: string;
  start?: number;
  end?: number;
}

export function validateSceneTiming(
  scenes: StoryboardScene[],
  durationSeconds: number,
): TimelineIssue[] {
  const issues: TimelineIssue[] = [];
  const sorted = [...scenes].sort((a, b) => a.startTime - b.startTime || a.order - b.order);

  sorted.forEach((scene, index) => {
    if (scene.startTime < 0) {
      issues.push({
        type: 'out_of_range',
        sceneId: scene.id,
        message: `${scene.title} starts before 0:00.`,
        start: scene.startTime,
      });
    }
    if (scene.endTime <= scene.startTime) {
      issues.push({
        type: 'negative_duration',
        sceneId: scene.id,
        message: `${scene.title} has an invalid duration.`,
        start: scene.startTime,
        end: scene.endTime,
      });
    }
    if (scene.endTime > durationSeconds + 0.05) {
      issues.push({
        type: 'out_of_range',
        sceneId: scene.id,
        message: `${scene.title} extends past the song.`,
        end: scene.endTime,
      });
    }
    const expectedOrder = index + 1;
    if (scene.order !== expectedOrder && sorted.every((s) => s.order === scenes.find((x) => x.id === s.id)?.order)) {
      // order mismatch is reported after reindex opportunities; still flag unsorted ids
    }
    const next = sorted[index + 1];
    if (next) {
      if (scene.endTime < next.startTime - 0.05) {
        issues.push({
          type: 'gap',
          sceneId: scene.id,
          message: `Gap between ${scene.title} and ${next.title}.`,
          start: scene.endTime,
          end: next.startTime,
        });
      } else if (scene.endTime > next.startTime + 0.05) {
        issues.push({
          type: 'overlap',
          sceneId: scene.id,
          message: `${scene.title} overlaps ${next.title}.`,
          start: next.startTime,
          end: scene.endTime,
        });
      }
    }
  });

  if (sorted.length > 0) {
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    if (first.startTime > 0.05) {
      issues.push({
        type: 'gap',
        sceneId: first.id,
        message: 'Storyboard does not start at the beginning of the song.',
        start: 0,
        end: first.startTime,
      });
    }
    if (last.endTime < durationSeconds - 0.15) {
      issues.push({
        type: 'gap',
        sceneId: last.id,
        message: 'Storyboard does not cover the end of the song.',
        start: last.endTime,
        end: durationSeconds,
      });
    }
  }

  return issues;
}

export function reindexScenes(scenes: StoryboardScene[]): StoryboardScene[] {
  return [...scenes]
    .sort((a, b) => a.startTime - b.startTime || a.order - b.order)
    .map((scene, index) => ({
      ...scene,
      order: index + 1,
      duration: Math.max(0, roundTime(scene.endTime - scene.startTime)),
    }));
}

export function coveragePercent(scenes: StoryboardScene[], durationSeconds: number): number {
  if (durationSeconds <= 0) return 0;
  const sorted = [...scenes].sort((a, b) => a.startTime - b.startTime);
  let covered = 0;
  let cursor = 0;
  for (const scene of sorted) {
    const start = Math.max(scene.startTime, cursor);
    const end = Math.min(scene.endTime, durationSeconds);
    if (end > start) covered += end - start;
    cursor = Math.max(cursor, scene.endTime);
  }
  return Math.max(0, Math.min(100, Math.round((covered / durationSeconds) * 1000) / 10));
}

export function missingCharacterReferences(
  scenes: StoryboardScene[],
  bible?: VisualBible,
): CharacterDefinition[] {
  if (!bible) return [];
  const usedIds = new Set(scenes.flatMap((s) => s.characters));
  return bible.characters.filter((c) => usedIds.has(c.id) && !c.lockedReferenceImage);
}

export function computeProjectHealth(project: MusicVideoProject): ProjectHealth {
  const issues = validateSceneTiming(project.scenes, project.durationSeconds);
  const timingConflicts = issues.filter((i) => i.type === 'overlap' || i.type === 'negative_duration').length;
  const gaps = issues.filter((i) => i.type === 'gap').length;
  const missingImages = project.scenes.filter((s) => !s.currentAssetId && !s.image).map((s) => s.title);
  const missingRefs = missingCharacterReferences(project.scenes, project.visualBible);
  const charactersTotal = project.visualBible?.characters.length ?? 0;
  const charactersApproved = project.visualBible?.characters.filter((c) => c.lockedReferenceImage).length ?? 0;
  const imagesGenerated = project.scenes.filter((s) => s.currentAssetId || s.image).length;
  const fatalOverlaps = issues.filter((i) => i.type === 'overlap' || i.type === 'negative_duration').length;

  const blockers: string[] = [];
  if (!project.audio) blockers.push('Upload a song before sharing.');
  if (!project.durationSeconds) blockers.push('Song duration is unknown.');
  if (project.scenes.length === 0) blockers.push('Generate a storyboard first.');
  if (missingImages.length > 0) {
    blockers.push(
      `${missingImages.length} scene${missingImages.length === 1 ? '' : 's'} ${missingImages.length === 1 ? 'is' : 'are'} missing images: ${missingImages.slice(0, 8).join(', ')}${missingImages.length > 8 ? '…' : ''}`,
    );
  }
  if (fatalOverlaps > 0) blockers.push('Fix overlapping or invalid scene timing.');

  return {
    storyboardCoveragePercent: coveragePercent(project.scenes, project.durationSeconds),
    imagesGenerated,
    imagesTotal: project.scenes.length,
    charactersApproved,
    charactersTotal,
    timingConflicts,
    gaps,
    missingImages,
    missingCharacterReferences: missingRefs.map((c) => c.name),
    readyToRender: blockers.length === 0,
    blockers,
  };
}

