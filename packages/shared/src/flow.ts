import type { MusicVideoProject } from './project.js';
import { EDITOR_STEPS, type EditorStep, type ProjectStatus } from './status.js';

export function isEditorStepComplete(project: MusicVideoProject, step: EditorStep): boolean {
  switch (step) {
    case 'setup':
      return Boolean(project.audio);
    case 'style':
      return Boolean(project.styleId);
    case 'bible':
      return Boolean(project.visualBibleApproved);
    case 'characters': {
      if (!project.visualBibleApproved) return false;
      const characters = project.visualBible?.characters ?? [];
      return characters.length === 0 || characters.every((character) => Boolean(character.referenceAssetId));
    }
    case 'storyboard':
      return project.scenes.length > 0;
    case 'images':
      return (
        project.scenes.length > 0 && project.scenes.every((scene) => Boolean(scene.currentAssetId || scene.image))
      );
    case 'video':
      return project.status === 'complete' || project.status === 'ready_to_render' || project.status === 'rendering';
  }
}

export function completedEditorStepCount(project: MusicVideoProject): number {
  return EDITOR_STEPS.filter((step) => isEditorStepComplete(project, step)).length;
}

export function nextEditorStep(project: MusicVideoProject): EditorStep {
  if (!isEditorStepComplete(project, 'setup')) return 'setup';
  if (!isEditorStepComplete(project, 'style')) return 'style';
  if (!isEditorStepComplete(project, 'bible')) return 'bible';
  if (!isEditorStepComplete(project, 'characters') && project.scenes.length === 0) return 'characters';
  if (!isEditorStepComplete(project, 'storyboard')) return 'storyboard';
  if (!isEditorStepComplete(project, 'images')) return 'images';
  return 'video';
}

export function editorStepForStatus(status: ProjectStatus): EditorStep {
  switch (status) {
    case 'setup':
      return 'setup';
    case 'visual_bible':
      return 'bible';
    case 'storyboard':
      return 'storyboard';
    case 'generating_images':
    case 'editing':
      return 'images';
    default:
      return 'video';
  }
}

export function environmentName(project: MusicVideoProject, environmentId?: string): string {
  if (!environmentId) return '—';
  return project.visualBible?.environments.find((environment) => environment.id === environmentId)?.name ?? '—';
}

export function characterNames(project: MusicVideoProject, characterIds: string[]): string {
  if (characterIds.length === 0) return '—';
  const names = characterIds.map((id) => project.visualBible?.characters.find((character) => character.id === id)?.name ?? id);
  return names.join(', ');
}
