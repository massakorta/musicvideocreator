import { describe, expect, it } from 'vitest';
import { selectMotion, selectTransition } from './motion.js';

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

  it('can use punchy motion for chaotic choruses', () => {
    const motion = selectMotion({
      shotType: 'wide',
      songSection: 'chorus',
      previousMotions: [],
      visualComedy: 'soup explodes in chaos',
    });
    expect(motion).toBeTruthy();
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
