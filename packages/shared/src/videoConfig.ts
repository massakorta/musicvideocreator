export const VIDEO_PRESETS = {
  '16x9': { id: '16x9', label: '16:9 Landscape', width: 1920, height: 1080, fps: 30 },
  '9x16': { id: '9x16', label: '9:16 Vertical', width: 1080, height: 1920, fps: 30 },
  '1x1': { id: '1x1', label: '1:1 Square', width: 1080, height: 1080, fps: 30 },
  '4x5': { id: '4x5', label: '4:5 Portrait', width: 1080, height: 1350, fps: 30 },
} as const;

export type VideoFormatId = keyof typeof VIDEO_PRESETS;

export const DEFAULT_VIDEO_FORMAT: VideoFormatId = '16x9';
export const DEFAULT_FPS = VIDEO_PRESETS['16x9'].fps;
export const DEFAULT_WIDTH = VIDEO_PRESETS['16x9'].width;
export const DEFAULT_HEIGHT = VIDEO_PRESETS['16x9'].height;

export function getVideoPreset(formatId: VideoFormatId = DEFAULT_VIDEO_FORMAT) {
  return VIDEO_PRESETS[formatId];
}

export function secondsToFrames(seconds: number, fps: number = DEFAULT_FPS): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  return Math.max(0, Math.round(seconds * fps));
}

export function framesToSeconds(frames: number, fps: number = DEFAULT_FPS): number {
  if (!Number.isFinite(frames) || fps <= 0) return 0;
  return frames / fps;
}

export function clampDuration(sceneEnd: number, audioDuration: number): number {
  return Math.min(sceneEnd, audioDuration);
}
