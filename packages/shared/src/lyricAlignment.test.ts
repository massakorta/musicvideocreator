import { describe, expect, it } from 'vitest';
import {
  alignLyricsToWords,
  estimateLyricAlignment,
  parseLyricLines,
  sceneSlotsFromAlignment,
} from './lyricAlignment.js';

const lyrics = `[Intro]
la la
[Verse 1]
Walking down the harbor
Lights on the water
[Chorus]
Harbor lights stay on
Harbor lights stay on`;

describe('parseLyricLines', () => {
  it('keeps section labels on each line', () => {
    const lines = parseLyricLines(lyrics);
    expect(lines.map((line) => line.section)).toEqual(['intro', 'verse', 'verse', 'chorus', 'chorus']);
  });
});

describe('alignLyricsToWords', () => {
  it('locks lyric lines to whisper word times', () => {
    const words = [
      { start: 8.0, end: 8.3, word: 'Walking' },
      { start: 8.3, end: 8.5, word: 'down' },
      { start: 8.5, end: 8.7, word: 'the' },
      { start: 8.7, end: 9.2, word: 'harbor' },
      { start: 9.4, end: 9.7, word: 'Lights' },
      { start: 9.7, end: 9.9, word: 'on' },
      { start: 9.9, end: 10.1, word: 'the' },
      { start: 10.1, end: 10.6, word: 'water' },
      { start: 14.0, end: 14.4, word: 'Harbor' },
      { start: 14.4, end: 14.8, word: 'lights' },
      { start: 14.8, end: 15.1, word: 'stay' },
      { start: 15.1, end: 15.5, word: 'on' },
      { start: 16.0, end: 16.4, word: 'Harbor' },
      { start: 16.4, end: 16.8, word: 'lights' },
      { start: 16.8, end: 17.1, word: 'stay' },
      { start: 17.1, end: 17.6, word: 'on' },
    ];

    const aligned = alignLyricsToWords(lyrics, words, 24);
    const harbor = aligned.find((line) => line.text.includes('Walking'));
    const chorus = aligned.find((line) => line.text.includes('Harbor lights stay on'));
    expect(harbor?.startTime).toBeCloseTo(8.0, 1);
    expect(harbor?.endTime).toBeCloseTo(9.2, 1);
    expect(chorus?.startTime).toBeCloseTo(14.0, 1);
    expect(chorus?.section).toBe('chorus');
  });
});

describe('sceneSlotsFromAlignment', () => {
  it('covers the song and keeps lyric excerpts on sung beats', () => {
    const alignment = estimateLyricAlignment(lyrics, 30);
    const slots = sceneSlotsFromAlignment(alignment, 30);
    expect(slots[0]?.startTime).toBe(0);
    expect(slots.at(-1)?.endTime).toBe(30);
    expect(slots.some((slot) => slot.lyricsExcerpt?.includes('harbor'))).toBe(true);
    for (let i = 0; i < slots.length - 1; i += 1) {
      expect(slots[i]!.endTime).toBeCloseTo(slots[i + 1]!.startTime, 3);
    }
  });
});
