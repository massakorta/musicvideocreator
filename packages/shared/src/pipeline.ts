import type { MusicVideoProject, StaleAssets } from './project.js';
import type { CharacterDefinition } from './visualBible.js';
import type { StoryboardScene } from './storyboard.js';

function hashParts(parts: unknown[]): string {
  const json = JSON.stringify(parts);
  let hash = 0;
  for (let i = 0; i < json.length; i++) {
    hash = (hash * 31 + json.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function characterReferenceFingerprint(
  character: CharacterDefinition,
  styleId: string | undefined,
  bibleMaster?: string,
  overallStyle?: { visualMedium: string; mood: string; renderingStyle: string },
): string {
  return hashParts([
    styleId,
    bibleMaster,
    overallStyle,
    character.id,
    character.name,
    character.bodyType,
    character.face,
    character.hair,
    character.clothing,
    character.colors,
    character.promptDescription,
    character.importantContinuityFeatures,
  ]);
}

export function sceneImageFingerprint(
  scene: StoryboardScene,
  project: MusicVideoProject,
): string {
  const bible = project.visualBible;
  const characters = scene.characters
    .map((id) => bible?.characters.find((c) => c.id === id))
    .filter(Boolean)
    .map((c) => ({
      id: c!.id,
      fp: c!.referenceFingerprint ?? characterReferenceFingerprint(c!, project.styleId, bible?.masterPrompt, bible?.overallStyle),
    }));
  const environment = bible?.environments.find((e) => e.id === scene.environmentId);
  return hashParts([
    project.styleId,
    bible?.masterPrompt,
    bible?.overallStyle,
    scene.title,
    scene.description,
    scene.action,
    scene.shotType,
    scene.cameraIntent,
    scene.visualComedy,
    scene.imagePrompt,
    scene.negativePrompt,
    scene.characters,
    scene.environmentId,
    environment?.promptDescription,
    characters,
  ]);
}

export function renderCompositionFingerprint(project: MusicVideoProject): string {
  return hashParts([
    project.durationSeconds,
    project.scenes.map((scene) => ({
      id: scene.id,
      assetId: scene.currentAssetId,
      motion: scene.motion,
      transitionIn: scene.transitionIn,
      transitionOut: scene.transitionOut,
      startTime: scene.startTime,
      endTime: scene.endTime,
    })),
    project.audio?.assetId,
  ]);
}

export function computeStaleAssets(project: MusicVideoProject): StaleAssets {
  const staleCharacterIds: string[] = [];
  const staleSceneIds: string[] = [];

  if (project.visualBible) {
    for (const character of project.visualBible.characters) {
      if (!character.referenceAssetId) continue;
      const current = characterReferenceFingerprint(
        character,
        project.styleId,
        project.visualBible.masterPrompt,
        project.visualBible.overallStyle,
      );
      if (character.referenceFingerprint !== current) {
        staleCharacterIds.push(character.id);
      }
    }
  }

  for (const scene of project.scenes) {
    if (!scene.currentAssetId && !scene.image) continue;
    const current = sceneImageFingerprint(scene, project);
    if (scene.imageFingerprint !== current) {
      staleSceneIds.push(scene.id);
    }
  }

  const currentRender = renderCompositionFingerprint(project);
  const videoStale = Boolean(project.renderFingerprint && project.renderFingerprint !== currentRender);

  return {
    staleCharacterIds,
    staleSceneIds,
    videoStale,
    totalStaleImages: staleCharacterIds.length + staleSceneIds.length,
  };
}

export function estimatePipelineSeconds(
  project: MusicVideoProject,
  kind: 'full' | 'stale_assets',
  stale?: StaleAssets,
): number {
  const duration = project.durationSeconds || 180;
  const sceneCount = kind === 'full' ? Math.round(Math.min(50, Math.max(20, 8 + (duration / 60) * 8))) : (stale?.staleSceneIds.length ?? 0);
  const charCount =
    kind === 'full'
      ? (project.visualBible?.characters.length ?? 2)
      : (stale?.staleCharacterIds.length ?? 0);
  const concurrency = 6;
  const bible = kind === 'full' ? 25 : 0;
  const storyboard = kind === 'full' ? Math.max(55, Math.round(duration * 0.45)) : 0;
  const chars = Math.ceil(Math.max(charCount, 1) / concurrency) * 10;
  const images = Math.ceil(Math.max(sceneCount, 1) / concurrency) * 8;
  const render = kind === 'full' || stale?.videoStale ? Math.max(90, Math.round(duration * 4)) : 0;
  return bible + storyboard + chars + images + render;
}

export function pipelineProgressFromJob(job: {
  stage: string;
  progress: number;
  charactersDone: number;
  charactersTotal: number;
  imagesDone: number;
  imagesTotal: number;
}): number {
  if (job.progress > 0) return job.progress;
  const weights: Record<string, [number, number]> = {
    bible: [0, 10],
    characters: [10, 25],
    storyboard: [25, 35],
    images: [35, 85],
    render: [85, 100],
  };
  const [start, end] = weights[job.stage] ?? [0, 100];
  if (job.stage === 'characters' && job.charactersTotal > 0) {
    const span = end - start;
    return Math.round(start + (job.charactersDone / job.charactersTotal) * span);
  }
  if (job.stage === 'images' && job.imagesTotal > 0) {
    const span = end - start;
    return Math.round(start + (job.imagesDone / job.imagesTotal) * span);
  }
  return start;
}

export function computeEtaAt(startedAt: string | undefined, expectedSeconds: number, progress: number): string | undefined {
  if (!startedAt || progress <= 0) {
    return new Date(Date.now() + expectedSeconds * 1000).toISOString();
  }
  const elapsed = (Date.now() - new Date(startedAt).getTime()) / 1000;
  const remaining = progress >= 100 ? 0 : Math.max(0, (elapsed / progress) * (100 - progress));
  return new Date(Date.now() + remaining * 1000).toISOString();
}
