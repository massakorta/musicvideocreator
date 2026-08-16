import { describe, expect, it } from 'vitest';
import { framesToSeconds, secondsToFrames } from './videoConfig.js';

describe('secondsToFrames', () => {
  it('converts at 30fps', () => {
    expect(secondsToFrames(1, 30)).toBe(30);
    expect(secondsToFrames(2.5, 30)).toBe(75);
  });

  it('clamps negatives and non-finite values', () => {
    expect(secondsToFrames(-4, 30)).toBe(0);
    expect(secondsToFrames(Number.NaN, 30)).toBe(0);
  });
});

describe('framesToSeconds', () => {
  it('inverts secondsToFrames', () => {
    expect(framesToSeconds(90, 30)).toBe(3);
  });
});
