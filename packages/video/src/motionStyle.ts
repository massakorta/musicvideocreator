import type { CSSProperties } from 'react';
import { Easing, interpolate, random } from 'remotion';
import { getMotionKeyframe, type MotionPresetId } from '@music-video/shared';

export function motionStyle(
  preset: MotionPresetId,
  frame: number,
  durationFrames: number,
  sceneId: string,
): CSSProperties {
  const durationSeconds = durationFrames / 30;
  const keyframe = getMotionKeyframe(preset, durationSeconds);
  const progress = interpolate(frame, [0, Math.max(1, durationFrames - 1)], [0, 1], {
    easing: Easing.inOut(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const scale = lerp(keyframe.start.scale, keyframe.end.scale, progress);
  const x = lerp(keyframe.start.x, keyframe.end.x, progress);
  const y = lerp(keyframe.start.y, keyframe.end.y, progress);
  const rotate = lerp(keyframe.start.rotate, keyframe.end.rotate, progress);

  let shakeX = 0;
  let shakeY = 0;
  if (keyframe.shakeAmplitude > 0) {
    const seed = random(sceneId);
    shakeX = Math.sin(frame * (0.9 + seed)) * keyframe.shakeAmplitude;
    shakeY = Math.cos(frame * (1.1 + seed * 0.4)) * keyframe.shakeAmplitude * 0.7;
  }

  return {
    position: 'absolute',
    inset: '-8%',
    width: '116%',
    height: '116%',
    objectFit: 'cover',
    transform: `translate(${x + shakeX}%, ${y + shakeY}%) scale(${scale}) rotate(${rotate}deg)`,
    transformOrigin: 'center center',
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
