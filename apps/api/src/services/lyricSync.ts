import { createOpenAiClient, transcribeAudioWords } from '@music-video/ai';
import {
  alignmentFromTranscription,
  lyricsTextFromSegments,
  AppError,
  ERROR_CODES,
  type LyricAlignment,
  type MusicVideoProject,
} from '@music-video/shared';
import { config } from '../config.js';
import { getRepositories } from '../repositories/index.js';
import { getObjectStorage } from '../storage/index.js';
import { prepareAudioForTranscription } from './audio.js';
import { nowIso } from './projectUtils.js';
import { saveProject } from './projects.js';

const TRANSCRIPTION_FAILED = 'Kunde inte läsa sången. Försök ladda upp igen.';

export async function ensureTranscribedLyrics(
  project: MusicVideoProject,
): Promise<{ project: MusicVideoProject; alignment: LyricAlignment }> {
  const audioAssetId = project.audio?.assetId;
  if (!audioAssetId) {
    throw new AppError(ERROR_CODES.VALIDATION, 'Upload a song before generating.', 400);
  }
  if (!project.durationSeconds) {
    throw new AppError(
      ERROR_CODES.VALIDATION,
      'Song duration is unknown. Re-upload the audio or set duration.',
      400,
    );
  }

  const existing = project.lyricAlignment;
  if (
    project.lyrics.trim() &&
    existing?.words.length &&
    existing.audioAssetId === audioAssetId &&
    existing.source === 'whisper'
  ) {
    return { project, alignment: existing };
  }

  try {
    const transcribed = await transcribeProjectAudio(project);
    const segments =
      transcribed.segments.length > 0
        ? transcribed.segments
        : transcribed.text.trim()
          ? [{ start: 0, end: project.durationSeconds, text: transcribed.text.trim() }]
          : [];

    if (segments.length === 0) {
      throw new Error('Whisper returned no lyrics.');
    }

    const lyrics = lyricsTextFromSegments(segments);
    const alignment: LyricAlignment = {
      ...alignmentFromTranscription(segments, transcribed.words, project.durationSeconds),
      audioAssetId,
      language: transcribed.language,
      createdAt: nowIso(),
    };

    if (!lyrics.trim() || alignment.lines.length === 0) {
      throw new Error('Whisper returned no usable lyric lines.');
    }

    const saved = await saveProject({
      ...project,
      lyrics,
      lyricAlignment: alignment,
    });
    return { project: saved, alignment };
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.warn('[lyric-sync] whisper failed', error);
    throw new AppError(ERROR_CODES.OPENAI_FAILED, TRANSCRIPTION_FAILED, 502);
  }
}

/** @deprecated Use ensureTranscribedLyrics — kept for callers that only need alignment. */
export async function ensureLyricAlignment(project: MusicVideoProject): Promise<LyricAlignment> {
  const { alignment } = await ensureTranscribedLyrics(project);
  return alignment;
}

async function transcribeProjectAudio(project: MusicVideoProject) {
  const assetId = project.audio?.assetId;
  if (!assetId) {
    throw new Error('No audio asset to transcribe.');
  }
  const asset = await getRepositories().assets.get(assetId);
  if (!asset) {
    throw new Error('Audio asset is missing.');
  }
  const file = await getObjectStorage().get(asset.storagePath);
  if (!file) {
    throw new Error('Audio file could not be read.');
  }
  const prepared = await prepareAudioForTranscription(file.body, project.audio?.filename || asset.storagePath);
  const client = createOpenAiClient({
    apiKey: config.openaiApiKey,
    textModel: config.openaiTextModel,
    imageModel: config.openaiImageModel,
  });
  return transcribeAudioWords(client, prepared.buffer, prepared.filename);
}
