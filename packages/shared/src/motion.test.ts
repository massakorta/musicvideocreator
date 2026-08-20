import { describe, expect, it } from 'vitest';
import { getMotionKeyframe, normalizeMotionPreset, selectMotion, selectTransition } from './motion.js';

describe('normalizeMotionPreset', () => {
  it('maps removed shake presets to zoom in and zoom out', () => {
    expect(normalizeMotionPreset('lightShake')).toBe('slowZoomIn');
    expect(normalizeMotionPreset('heavyShake')).toBe('slowZoomOut');
  });

  it('renders legacy shake presets as zoom keyframes', () => {
    expect(getMotionKeyframe('lightShake', 5).shakeAmplitude).toBe(0);
    expect(getMotionKeyframe('heavyShake', 5).shakeAmplitude).toBe(0);
    expect(getMotionKeyframe('lightShake', 5).end.scale).toBeGreaterThan(1);
    expect(getMotionKeyframe('heavyShake', 5).start.scale).toBeGreaterThan(1);
  });
});

describe('selectMotion', () => {
  it('avoids repeating the same motion three times', () => {
    const first = selectMotion({
      shotType: 'close-up',
      songSection: 'verse',
      previousMotions: ['slowZoomIn', 'slowZoomIn'],
      suggested: 'slowZoomIn',
    });
    expect(first).not.toBe('slowZoomIn');
  });

  it('prefers calmer motion for bridges', () => {
    const motion = selectMotion({
      shotType: 'medium',
      songSection: 'bridge',
      previousMotions: [],
    });
    expect(['slowZoomOut', 'gentleDrift', 'slowZoomIn', 'zoomPanLeft']).toContain(motion);
  });

  it('never picks removed shake presets', () => {
    const motion = selectMotion({
      shotType: 'wide',
      songSection: 'chorus',
      previousMotions: [],
      visualComedy: 'soup explodes in chaos',
      suggested: 'lightShake',
    });
    expect(motion).not.toBe('lightShake');
    expect(motion).not.toBe('heavyShake');
  });
});

describe('selectTransition', () => {
  it('flashes into a chorus', () => {
    expect(selectTransition('verse', 'chorus')).toBe('flash');
  });

  it('uses cuts inside energetic choruses', () => {
    expect(selectTransition('chorus', 'chorus')).toBe('cut');
  });
});
