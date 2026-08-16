import { describe, expect, it } from 'vitest';
import { getMotionKeyframe } from '@music-video/shared';

describe('ken burns bounds', () => {
  it('keeps scale above 1 so edges stay covered', () => {
    const presets = ['slowZoomIn', 'panLeft', 'gentleDrift', 'dramaticZoom'] as const;
    for (const preset of presets) {
      const kf = getMotionKeyframe(preset, 6);
      expect(kf.start.scale).toBeGreaterThanOrEqual(1);
      expect(kf.end.scale).toBeGreaterThanOrEqual(1);
      expect(Math.max(kf.start.scale, kf.end.scale)).toBeLessThanOrEqual(1.25);
    }
  });
});
