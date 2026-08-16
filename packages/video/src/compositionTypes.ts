import type { MotionPresetId, MusicVideoProject, TransitionPresetId, VideoFormatId } from '@music-video/shared';
import { getVideoPreset, secondsToFrames } from '@music-video/shared';

export interface CompositionScene {
  id: string;
  startTime: number;
  endTime: number;
  imageUrl: string;
  motion: MotionPresetId;
  transitionIn: TransitionPresetId;
  transitionOut: TransitionPresetId;
}

export interface CompositionProject {
  durationSeconds: number;
  audioUrl?: string;
  formatId: VideoFormatId;
  scenes: CompositionScene[];
}

export interface MusicVideoCompositionProps {
  project: CompositionProject;
  includeAudio?: boolean;
}

export const TRANSITION_FRAMES: Record<TransitionPresetId, number> = {
  cut: 0,
  fade: 10,
  crossfade: 12,
  dipToBlack: 14,
  flash: 6,
  slideLeft: 10,
  slideRight: 10,
};

export function projectToComposition(project: MusicVideoProject): CompositionProject {
  return {
    durationSeconds: project.audio?.durationSeconds ?? project.durationSeconds,
    audioUrl: project.audio?.url,
    formatId: project.formatId,
    scenes: project.scenes
      .filter((scene) => scene.image?.publicUrl || scene.currentAssetId)
      .map((scene) => ({
        id: scene.id,
        startTime: scene.startTime,
        endTime: scene.endTime,
        imageUrl: scene.image?.publicUrl ?? '',
        motion: scene.motion,
        transitionIn: scene.transitionIn,
        transitionOut: scene.transitionOut,
      }))
      .filter((scene) => scene.imageUrl.length > 0),
  };
}

export function compositionDurationFrames(project: CompositionProject): number {
  const preset = getVideoPreset(project.formatId);
  return Math.max(1, secondsToFrames(project.durationSeconds, preset.fps));
}
