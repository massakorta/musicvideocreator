import { toFile, type OpenAI } from 'openai';
import type { TimedWord } from '@music-video/shared';

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResult {
  language?: string;
  text: string;
  words: TimedWord[];
  segments: TranscriptionSegment[];
}

export async function transcribeAudioWords(
  client: OpenAI,
  buffer: Buffer,
  filename: string,
): Promise<TranscriptionResult> {
  const file = await toFile(buffer, filename || 'song.mp3');
  const result = await client.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    response_format: 'verbose_json',
    timestamp_granularities: ['word', 'segment'],
  });

  const words = extractWords(result);
  const segments = extractSegments(result);
  return {
    language: typeof result.language === 'string' ? result.language : undefined,
    text: result.text ?? '',
    words,
    segments,
  };
}

function extractSegments(result: {
  segments?: Array<{ start?: number; end?: number; text?: string }>;
}): TranscriptionSegment[] {
  return (result.segments ?? [])
    .flatMap((segment) => {
      const text = segment.text?.trim();
      if (!text || segment.start == null || segment.end == null) return [];
      return [{ start: segment.start, end: segment.end, text }];
    });
}

function extractWords(result: {
  words?: Array<{ word?: string; start?: number; end?: number }>;
  segments?: Array<{
    start?: number;
    end?: number;
    text?: string;
    words?: Array<{ word?: string; start?: number; end?: number }>;
  }>;
}): TimedWord[] {
  const fromWords = (result.words ?? []).flatMap((word) => timedWord(word));
  if (fromWords.length > 0) return fromWords;

  const fromSegments = (result.segments ?? []).flatMap((segment) => {
    const nested = (segment.words ?? []).flatMap((word) => timedWord(word));
    if (nested.length > 0) return nested;
    const text = segment.text?.trim();
    if (!text || segment.start == null || segment.end == null) return [];
    return splitSegmentWords(text, segment.start, segment.end);
  });
  return fromSegments;
}

function timedWord(word: { word?: string; start?: number; end?: number }): TimedWord[] {
  const text = word.word?.trim();
  if (!text || word.start == null || word.end == null) return [];
  return [{ word: text, start: word.start, end: Math.max(word.end, word.start + 0.05) }];
}

function splitSegmentWords(text: string, start: number, end: number): TimedWord[] {
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return [];
  const span = Math.max(0.2, end - start);
  return parts.map((word, index) => ({
    word,
    start: start + (span * index) / parts.length,
    end: start + (span * (index + 1)) / parts.length,
  }));
}
