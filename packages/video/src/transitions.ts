import { interpolate } from 'remotion';
import type { TransitionPresetId } from '@music-video/shared';
import { TRANSITION_FRAMES } from './compositionTypes.js';

export interface TransitionStyle {
  opacity: number;
  transform: string;
  overlayOpacity: number;
  overlayColor: string;
}

export function transitionStyleForFrame(options: {
  frame: number;
  durationFrames: number;
  transitionIn: TransitionPresetId;
  transitionOut: TransitionPresetId;
}): TransitionStyle {
  const { frame, durationFrames, transitionIn, transitionOut } = options;
  const inFrames = Math.min(TRANSITION_FRAMES[transitionIn], Math.floor(durationFrames / 3));
  const outFrames = Math.min(TRANSITION_FRAMES[transitionOut], Math.floor(durationFrames / 3));

  let opacity = 1;
  let x = 0;
  let overlayOpacity = 0;
  let overlayColor = '#000';

  if (inFrames > 0 && frame < inFrames) {
    const t = interpolate(frame, [0, inFrames], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    if (transitionIn === 'fade' || transitionIn === 'crossfade' || transitionIn === 'dipToBlack') {
      opacity = t;
    }
    if (transitionIn === 'flash') {
      overlayColor = '#fff7e8';
      overlayOpacity = 1 - t;
    }
    if (transitionIn === 'dipToBlack') {
      overlayColor = '#000';
      overlayOpacity = 1 - t;
    }
    if (transitionIn === 'slideLeft') x = interpolate(t, [0, 1], [8, 0]);
    if (transitionIn === 'slideRight') x = interpolate(t, [0, 1], [-8, 0]);
  }

  const outStart = durationFrames - outFrames;
  if (outFrames > 0 && frame >= outStart) {
    const t = interpolate(frame, [outStart, durationFrames], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    if (transitionOut === 'fade' || transitionOut === 'crossfade' || transitionOut === 'dipToBlack') {
      opacity = 1 - t;
    }
    if (transitionOut === 'flash') {
      overlayColor = '#fff7e8';
      overlayOpacity = t;
    }
    if (transitionOut === 'dipToBlack') {
      overlayColor = '#000';
      overlayOpacity = t;
    }
    if (transitionOut === 'slideLeft') x = interpolate(t, [0, 1], [0, -8]);
    if (transitionOut === 'slideRight') x = interpolate(t, [0, 1], [0, 8]);
  }

  return {
    opacity,
    transform: `translateX(${x}%)`,
    overlayOpacity,
    overlayColor,
  };
}
