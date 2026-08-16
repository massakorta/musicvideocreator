export const MOTION_PRESETS = [
  'static',
  'slowZoomIn',
  'slowZoomOut',
  'panLeft',
  'panRight',
  'panUp',
  'panDown',
  'zoomPanLeft',
  'zoomPanRight',
  'subtleRotateClockwise',
  'subtleRotateCounterClockwise',
  'gentleDrift',
  'dramaticZoom',
  'punchZoom',
  'lightShake',
  'heavyShake',
] as const;

export type MotionPresetId = (typeof MOTION_PRESETS)[number];

export const MOTION_PRESET_LABELS: Record<MotionPresetId, string> = {
  static: 'Static',
  slowZoomIn: 'Slow Zoom In',
  slowZoomOut: 'Slow Zoom Out',
  panLeft: 'Pan Left',
  panRight: 'Pan Right',
  panUp: 'Pan Up',
  panDown: 'Pan Down',
  zoomPanLeft: 'Zoom + Pan Left',
  zoomPanRight: 'Zoom + Pan Right',
  subtleRotateClockwise: 'Subtle Rotate CW',
  subtleRotateCounterClockwise: 'Subtle Rotate CCW',
  gentleDrift: 'Gentle Drift',
  dramaticZoom: 'Dramatic Zoom',
  punchZoom: 'Punch Zoom',
  lightShake: 'Light Shake',
  heavyShake: 'Heavy Shake',
};

export const TRANSITION_PRESETS = [
  'cut',
  'fade',
  'crossfade',
  'dipToBlack',
  'flash',
  'slideLeft',
  'slideRight',
] as const;

export type TransitionPresetId = (typeof TRANSITION_PRESETS)[number];

export const TRANSITION_PRESET_LABELS: Record<TransitionPresetId, string> = {
  cut: 'Cut',
  fade: 'Fade',
  crossfade: 'Crossfade',
  dipToBlack: 'Dip to Black',
  flash: 'Flash',
  slideLeft: 'Slide Left',
  slideRight: 'Slide Right',
};

export interface KenBurnsTransform {
  scale: number;
  x: number;
  y: number;
  rotate: number;
}

export interface MotionKeyframe {
  start: KenBurnsTransform;
  end: KenBurnsTransform;
  shakeAmplitude: number;
}

const BASE: KenBurnsTransform = { scale: 1, x: 0, y: 0, rotate: 0 };

export function getMotionKeyframe(preset: MotionPresetId, durationSeconds: number): MotionKeyframe {
  const intensity = motionIntensityForDuration(durationSeconds);

  switch (preset) {
    case 'static':
      return { start: BASE, end: { ...BASE, scale: 1.02 }, shakeAmplitude: 0 };
    case 'slowZoomIn':
      return { start: BASE, end: { scale: 1 + 0.1 * intensity, x: -1.5, y: 0.8, rotate: 0 }, shakeAmplitude: 0 };
    case 'slowZoomOut':
      return {
        start: { scale: 1 + 0.1 * intensity, x: 1.2, y: -0.6, rotate: 0 },
        end: BASE,
        shakeAmplitude: 0,
      };
    case 'panLeft':
      return {
        start: { scale: 1.08, x: 4 * intensity, y: 0, rotate: 0 },
        end: { scale: 1.08, x: -4 * intensity, y: 0, rotate: 0 },
        shakeAmplitude: 0,
      };
    case 'panRight':
      return {
        start: { scale: 1.08, x: -4 * intensity, y: 0, rotate: 0 },
        end: { scale: 1.08, x: 4 * intensity, y: 0, rotate: 0 },
        shakeAmplitude: 0,
      };
    case 'panUp':
      return {
        start: { scale: 1.1, x: 0, y: 3 * intensity, rotate: 0 },
        end: { scale: 1.1, x: 0, y: -3 * intensity, rotate: 0 },
        shakeAmplitude: 0,
      };
    case 'panDown':
      return {
        start: { scale: 1.1, x: 0, y: -3 * intensity, rotate: 0 },
        end: { scale: 1.1, x: 0, y: 3 * intensity, rotate: 0 },
        shakeAmplitude: 0,
      };
    case 'zoomPanLeft':
      return {
        start: { scale: 1.02, x: 3 * intensity, y: 0.5, rotate: 0 },
        end: { scale: 1.12, x: -3 * intensity, y: -0.4, rotate: 0 },
        shakeAmplitude: 0,
      };
    case 'zoomPanRight':
      return {
        start: { scale: 1.02, x: -3 * intensity, y: -0.4, rotate: 0 },
        end: { scale: 1.12, x: 3 * intensity, y: 0.5, rotate: 0 },
        shakeAmplitude: 0,
      };
    case 'subtleRotateClockwise':
      return {
        start: { scale: 1.06, x: 0, y: 0, rotate: -1.2 * intensity },
        end: { scale: 1.08, x: 0.5, y: 0.3, rotate: 1.2 * intensity },
        shakeAmplitude: 0,
      };
    case 'subtleRotateCounterClockwise':
      return {
        start: { scale: 1.06, x: 0, y: 0, rotate: 1.2 * intensity },
        end: { scale: 1.08, x: -0.5, y: -0.3, rotate: -1.2 * intensity },
        shakeAmplitude: 0,
      };
    case 'gentleDrift':
      return {
        start: { scale: 1.04, x: -1.5 * intensity, y: 1 * intensity, rotate: -0.4 },
        end: { scale: 1.08, x: 1.5 * intensity, y: -0.8 * intensity, rotate: 0.4 },
        shakeAmplitude: 0,
      };
    case 'dramaticZoom':
      return {
        start: BASE,
        end: { scale: 1 + 0.18 * intensity, x: -2, y: 1, rotate: 0.3 },
        shakeAmplitude: 0,
      };
    case 'punchZoom':
      return {
        start: { scale: 1.02, x: 0, y: 0, rotate: 0 },
        end: { scale: 1.2, x: 0, y: 0, rotate: 0 },
        shakeAmplitude: 0.4,
      };
    case 'lightShake':
      return {
        start: { scale: 1.08, x: 0, y: 0, rotate: 0 },
        end: { scale: 1.1, x: 1, y: -0.5, rotate: 0 },
        shakeAmplitude: 1.2,
      };
    case 'heavyShake':
      return {
        start: { scale: 1.1, x: 0, y: 0, rotate: 0 },
        end: { scale: 1.14, x: 0, y: 0, rotate: 0 },
        shakeAmplitude: 2.6,
      };
    default:
      return { start: BASE, end: { ...BASE, scale: 1.06 }, shakeAmplitude: 0 };
  }
}

export function motionIntensityForDuration(durationSeconds: number): number {
  if (durationSeconds <= 2) return 0.55;
  if (durationSeconds <= 4) return 0.75;
  if (durationSeconds <= 8) return 1;
  return 1.15;
}

const CLOSE_UPS: ShotTypeLike[] = ['close-up', 'extreme-close-up'];
const WIDE: ShotTypeLike[] = ['extreme-wide', 'wide'];

type ShotTypeLike = string;
type SongSectionLike = string;

export interface MotionSelectionInput {
  shotType: ShotTypeLike;
  songSection: SongSectionLike;
  suggested?: MotionPresetId;
  previousMotions: MotionPresetId[];
  visualComedy?: string;
  cameraIntent?: string;
  motionIntensity?: number;
}

export function selectMotion(input: MotionSelectionInput): MotionPresetId {
  const { shotType, songSection, suggested, previousMotions, visualComedy, cameraIntent } = input;
  const lastThree = previousMotions.slice(-3);
  const energetic =
    /chaos|action|crash|slam|punch|explode|fight|run/i.test(`${visualComedy ?? ''} ${cameraIntent ?? ''}`) ||
    songSection === 'chorus';

  const candidates: MotionPresetId[] = [];

  if (suggested && MOTION_PRESETS.includes(suggested)) {
    candidates.push(suggested);
  }

  if (CLOSE_UPS.includes(shotType)) {
    candidates.push('slowZoomIn', 'gentleDrift', 'subtleRotateClockwise');
  } else if (WIDE.includes(shotType)) {
    candidates.push('slowZoomIn', 'panRight', 'panLeft', 'zoomPanRight');
  } else {
    candidates.push('gentleDrift', 'slowZoomIn', 'zoomPanLeft', 'slowZoomOut');
  }

  if (energetic) {
    candidates.unshift('dramaticZoom', 'punchZoom', 'lightShake');
  }

  if (songSection === 'bridge' || songSection === 'outro') {
    candidates.unshift('slowZoomOut', 'gentleDrift');
  }

  if (songSection === 'intro') {
    candidates.unshift('slowZoomIn', 'panRight');
  }

  const unique = [...new Set(candidates)].filter((m) => m !== 'heavyShake' || energetic);
  const available = unique.filter((m) => !isTooRepetitive(m, lastThree));
  const pool = available.length > 0 ? available : unique;
  const index = hashString(`${shotType}:${songSection}:${previousMotions.length}`) % pool.length;
  return pool[index] ?? 'slowZoomIn';
}

function isTooRepetitive(motion: MotionPresetId, lastThree: MotionPresetId[]): boolean {
  if (lastThree.length < 2) return false;
  return lastThree.every((m) => m === motion) || lastThree.slice(-2).every((m) => m === motion);
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function selectTransition(songSection: SongSectionLike, nextSection?: SongSectionLike): TransitionPresetId {
  if (nextSection && nextSection !== songSection) {
    if (nextSection === 'chorus') return 'flash';
    if (nextSection === 'bridge' || nextSection === 'outro') return 'dipToBlack';
    return 'crossfade';
  }
  if (songSection === 'chorus') return 'cut';
  if (songSection === 'intro' || songSection === 'outro' || songSection === 'bridge') return 'crossfade';
  return 'cut';
}
