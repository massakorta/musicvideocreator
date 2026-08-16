import type { SongSection } from './status.js';
import { classifySongSection, parseLyricSections, roundTime, suggestedSceneCount } from './lyrics.js';

export interface TimedWord {
  start: number;
  end: number;
  word: string;
}

export interface TimedLyricLine {
  startTime: number;
  endTime: number;
  text: string;
  section: SongSection;
}

export interface LyricAlignment {
  audioAssetId?: string;
  source: 'whisper' | 'estimated';
  language?: string;
  words: TimedWord[];
  lines: TimedLyricLine[];
  createdAt: string;
}

export interface SceneTimingSlot {
  startTime: number;
  endTime: number;
  songSection: SongSection;
  lyricsExcerpt?: string;
  title: string;
}

export function normalizeLyricToken(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '');
}

export function parseLyricLines(lyrics: string): Array<{ text: string; section: SongSection; label: string }> {
  return parseLyricSections(lyrics).flatMap((section) => {
    const songSection = classifySongSection(section.label);
    return section.lines
      .map((line) => line.trim())
      .filter(Boolean)
      .map((text) => ({ text, section: songSection, label: section.label }));
  });
}

export function estimateLyricAlignment(lyrics: string, durationSeconds: number): LyricAlignment {
  const lyricLines = parseLyricLines(lyrics);
  const duration = Math.max(0.8, durationSeconds);
  if (lyricLines.length === 0) {
    return {
      source: 'estimated',
      words: [],
      lines: [],
      createdAt: new Date().toISOString(),
    };
  }

  const hasIntro = lyricLines[0]?.section === 'intro';
  const hasOutro = lyricLines.at(-1)?.section === 'outro';
  const introPad = hasIntro ? 0 : Math.min(8, duration * 0.08);
  const outroPad = hasOutro ? 0 : Math.min(6, duration * 0.06);
  const usable = Math.max(1, duration - introPad - outroPad);
  const weights = lyricLines.map((line) => Math.max(8, line.text.length));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;

  let cursor = introPad;
  const lines = lyricLines.map((line, index) => {
    const length = usable * (weights[index]! / totalWeight);
    const startTime = cursor;
    cursor += length;
    return {
      startTime: roundTime(startTime),
      endTime: roundTime(cursor),
      text: line.text,
      section: line.section,
    };
  });

  return {
    source: 'estimated',
    words: [],
    lines,
    createdAt: new Date().toISOString(),
  };
}

export function alignLyricsToWords(
  lyrics: string,
  words: TimedWord[],
  durationSeconds: number,
): TimedLyricLine[] {
  const lyricLines = parseLyricLines(lyrics);
  const tokens = words
    .map((word) => ({ ...word, norm: normalizeLyricToken(word.word) }))
    .filter((word) => word.norm.length > 0);

  if (lyricLines.length === 0) return [];
  if (tokens.length === 0) return estimateLyricAlignment(lyrics, durationSeconds).lines;

  const matches: Array<{ start: number; end: number } | null> = [];
  let cursor = 0;
  for (const line of lyricLines) {
    const lineTokens = line.text.split(/\s+/).map(normalizeLyricToken).filter(Boolean);
    const match = findLineMatch(tokens, lineTokens, cursor);
    matches.push(match);
    if (match) cursor = match.end + 1;
  }

  const aligned: TimedLyricLine[] = lyricLines.map((line, index) => {
    const match = matches[index];
    if (match) {
      return {
        startTime: tokens[match.start]!.start,
        endTime: Math.max(tokens[match.end]!.end, tokens[match.start]!.start + 0.35),
        text: line.text,
        section: line.section,
      };
    }

    let previousIndex = -1;
    for (let look = index - 1; look >= 0; look -= 1) {
      if (matches[look]) {
        previousIndex = look;
        break;
      }
    }
    let nextIndex = -1;
    for (let look = index + 1; look < matches.length; look += 1) {
      if (matches[look]) {
        nextIndex = look;
        break;
      }
    }

    const gapStart = previousIndex >= 0 ? tokens[matches[previousIndex]!.end]!.end : 0;
    const gapEnd = nextIndex >= 0 ? tokens[matches[nextIndex]!.start]!.start : durationSeconds;
    const firstUnmatched = previousIndex + 1;
    const lastUnmatched = nextIndex === -1 ? matches.length - 1 : nextIndex - 1;
    const gapCount = lastUnmatched - firstUnmatched + 1;
    const offset = index - firstUnmatched;
    const span = Math.max(0.4, (gapEnd - gapStart) / Math.max(1, gapCount));
    return {
      startTime: gapStart + span * offset,
      endTime: gapStart + span * (offset + 1),
      text: line.text,
      section: line.section,
    };
  });

  return clampAlignedLines(aligned, durationSeconds);
}

export function sceneSlotsFromAlignment(
  alignment: LyricAlignment,
  durationSeconds: number,
): SceneTimingSlot[] {
  const duration = Math.max(0.8, durationSeconds);
  const { min, max, target } = suggestedSceneCount(duration);
  const lines = [...alignment.lines].sort((a, b) => a.startTime - b.startTime);

  if (lines.length === 0) {
    return splitEvenSlots(0, duration, Math.min(max, Math.max(min, target)), 'instrumental', 'Instrumental');
  }

  const slots: SceneTimingSlot[] = [];
  let cursor = 0;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]!;
    if (line.startTime > cursor + 1.15) {
      const section: SongSection = cursor < 0.6 ? 'intro' : 'instrumental';
      slots.push({
        startTime: cursor,
        endTime: line.startTime,
        songSection: section,
        title: section === 'intro' ? 'Intro' : 'Instrumental',
      });
      cursor = line.startTime;
    }

    let end = Math.max(line.endTime, line.startTime + 0.7);
    let excerpt = line.text;
    let count = 1;
    let nextIndex = index + 1;
    while (nextIndex < lines.length) {
      const next = lines[nextIndex]!;
      const gap = next.startTime - end;
      const mergedEnd = Math.max(next.endTime, end);
      const start = Math.min(cursor, line.startTime);
      const mergedDuration = mergedEnd - start;
      if (gap > 1.5) break;
      if (next.section !== line.section && mergedDuration >= 2.4) break;
      if (mergedDuration >= 7.2 && count >= 1) break;
      if (count >= 2 && mergedDuration >= 2.6 && gap > 0.28) break;
      excerpt = `${excerpt} / ${next.text}`;
      end = mergedEnd;
      count += 1;
      nextIndex += 1;
    }

    slots.push({
      startTime: Math.min(cursor, line.startTime),
      endTime: end,
      songSection: line.section,
      lyricsExcerpt: excerpt,
      title: excerpt.slice(0, 48) || line.section,
    });
    cursor = end;
    index = nextIndex;
  }

  if (cursor < duration - 0.45) {
    slots.push({
      startTime: cursor,
      endTime: duration,
      songSection: 'outro',
      title: 'Outro',
    });
  }

  const sealed = sealSlots(slots, duration);
  return fitSlotCount(sealed, duration, min, max, target);
}

function findLineMatch(
  tokens: Array<TimedWord & { norm: string }>,
  lineTokens: string[],
  fromIndex: number,
): { start: number; end: number } | null {
  if (lineTokens.length === 0 || fromIndex >= tokens.length) return null;

  let best: { start: number; end: number; score: number } | null = null;
  const searchEnd = Math.min(tokens.length, fromIndex + 90);

  for (let start = fromIndex; start < searchEnd; start += 1) {
    let tokenIndex = start;
    let matched = 0;
    let last = start;
    for (const lyricToken of lineTokens) {
      let found = -1;
      for (let look = tokenIndex; look < Math.min(tokens.length, tokenIndex + 4); look += 1) {
        if (tokensClose(tokens[look]!.norm, lyricToken)) {
          found = look;
          break;
        }
      }
      if (found === -1) continue;
      matched += 1;
      last = found;
      tokenIndex = found + 1;
    }

    const coverage = matched / lineTokens.length;
    if (coverage < 0.6 && matched < 2) continue;
    const score = coverage - (start - fromIndex) * 0.002;
    if (!best || score > best.score) {
      best = { start, end: last, score };
    }
    if (coverage >= 0.85 && start - fromIndex < 10) break;
  }

  return best ? { start: best.start, end: best.end } : null;
}

function tokensClose(left: string, right: string): boolean {
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length >= 4 && right.length >= 4 && (left.startsWith(right) || right.startsWith(left))) return true;
  return Math.abs(left.length - right.length) <= 1 && editDistance(left, right) <= 1;
}

function editDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (Math.abs(left.length - right.length) > 1) return 2;
  const rows = left.length + 1;
  const cols = right.length + 1;
  const grid = Array.from({ length: rows }, (_, i) => {
    const row = new Array<number>(cols);
    row[0] = i;
    return row;
  });
  for (let j = 0; j < cols; j += 1) grid[0]![j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      grid[i]![j] = Math.min(grid[i - 1]![j]! + 1, grid[i]![j - 1]! + 1, grid[i - 1]![j - 1]! + cost);
    }
  }
  return grid[left.length]![right.length]!;
}

function clampAlignedLines(lines: TimedLyricLine[], durationSeconds: number): TimedLyricLine[] {
  const duration = Math.max(0.8, durationSeconds);
  const next = lines.map((line) => ({
    ...line,
    startTime: roundTime(Math.max(0, line.startTime)),
    endTime: roundTime(Math.min(duration, Math.max(line.endTime, line.startTime + 0.3))),
  }));
  for (let i = 1; i < next.length; i += 1) {
    if (next[i]!.startTime < next[i - 1]!.endTime) {
      const mid = (next[i - 1]!.endTime + next[i]!.startTime) / 2;
      next[i - 1]!.endTime = roundTime(mid);
      next[i]!.startTime = roundTime(mid);
    }
  }
  return next.filter((line) => line.endTime > line.startTime);
}

function sealSlots(slots: SceneTimingSlot[], durationSeconds: number): SceneTimingSlot[] {
  if (slots.length === 0) return slots;
  const next = [...slots].sort((a, b) => a.startTime - b.startTime);
  next[0]!.startTime = 0;
  for (let i = 0; i < next.length; i += 1) {
    const slot = next[i]!;
    const following = next[i + 1];
    if (following) {
      const mid = (slot.endTime + following.startTime) / 2;
      slot.endTime = mid;
      following.startTime = mid;
    } else {
      slot.endTime = durationSeconds;
    }
    if (slot.endTime <= slot.startTime) {
      slot.endTime = slot.startTime + 0.4;
    }
    slot.startTime = roundTime(slot.startTime);
    slot.endTime = roundTime(slot.endTime);
    slot.title = slot.title.trim() || slot.songSection;
  }
  next[next.length - 1]!.endTime = roundTime(durationSeconds);
  return next.filter((slot) => slot.endTime > slot.startTime + 0.2);
}

function fitSlotCount(
  slots: SceneTimingSlot[],
  durationSeconds: number,
  min: number,
  max: number,
  target: number,
): SceneTimingSlot[] {
  const next = [...slots];
  while (next.length > max) {
    const mergeAt = shortestMergeIndex(next);
    if (mergeAt < 0) break;
    next.splice(mergeAt, 2, mergeSlots(next[mergeAt]!, next[mergeAt + 1]!));
  }
  while (next.length < min) {
    const splitAt = longestSplitIndex(next);
    if (splitAt < 0) break;
    const [left, right] = splitSlot(next[splitAt]!);
    next.splice(splitAt, 1, left, right);
    if (next.length >= target) break;
  }
  return sealSlots(next, durationSeconds);
}

function shortestMergeIndex(slots: SceneTimingSlot[]): number {
  let best = -1;
  let bestDuration = Number.POSITIVE_INFINITY;
  for (let i = 0; i < slots.length - 1; i += 1) {
    const duration = slots[i + 1]!.endTime - slots[i]!.startTime;
    const same = slots[i]!.songSection === slots[i + 1]!.songSection;
    const score = duration - (same ? 1.5 : 0);
    if (score < bestDuration) {
      bestDuration = score;
      best = i;
    }
  }
  return best;
}

function longestSplitIndex(slots: SceneTimingSlot[]): number {
  let best = -1;
  let bestDuration = 4.8;
  for (let i = 0; i < slots.length; i += 1) {
    const duration = slots[i]!.endTime - slots[i]!.startTime;
    if (duration > bestDuration) {
      bestDuration = duration;
      best = i;
    }
  }
  return best;
}

function mergeSlots(left: SceneTimingSlot, right: SceneTimingSlot): SceneTimingSlot {
  const excerpt = [left.lyricsExcerpt, right.lyricsExcerpt].filter(Boolean).join(' / ') || undefined;
  return {
    startTime: left.startTime,
    endTime: right.endTime,
    songSection: left.songSection,
    lyricsExcerpt: excerpt,
    title: (excerpt ?? left.title).slice(0, 48),
  };
}

function splitSlot(slot: SceneTimingSlot): [SceneTimingSlot, SceneTimingSlot] {
  const mid = (slot.startTime + slot.endTime) / 2;
  return [
    { ...slot, endTime: mid, title: slot.title },
    { ...slot, startTime: mid, title: slot.lyricsExcerpt ? `${slot.title} (cont.)` : slot.title },
  ];
}

function splitEvenSlots(
  start: number,
  end: number,
  count: number,
  section: SongSection,
  title: string,
): SceneTimingSlot[] {
  const safeCount = Math.max(1, count);
  const span = Math.max(0.4, end - start);
  return Array.from({ length: safeCount }, (_, index) => ({
    startTime: roundTime(start + (span * index) / safeCount),
    endTime: roundTime(start + (span * (index + 1)) / safeCount),
    songSection: section,
    title: safeCount === 1 ? title : `${title} ${index + 1}`,
  }));
}
