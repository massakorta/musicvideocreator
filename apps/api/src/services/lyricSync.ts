import { createOpenAiClient, isOpenAiConfigured, transcribeAudioWords } from '@music-video/ai';
import {
  alignLyricsToWords,
  estimateLyricAlignment,
  type LyricAlignment,
  type MusicVideoProject,
} from '@music-video/shared';
import { config, openaiConfigured } from '../config.js';
import { getRepositories } from '../repositories/index.js';
import { getObjectStorage } from '../storage/index.js';
import { prepareAudioForTranscription } from './audio.js';
import { nowIso } from './projectUtils.js';

export async function ensureLyricAlignment(project: MusicVideoProject): Promise<LyricAlignment> {
  const audioAssetId = project.audio?.assetId;
  const existing = project.lyricAlignment;
  if (existing?.words.length && existing.audioAssetId === audioAssetId) {
    return {
      ...existing,
      lines: alignLyricsToWords(project.lyrics, existing.words, project.durationSeconds),
    };
  }

  if (openaiConfigured() && isOpenAiConfigured(config.openaiApiKey) && audioAssetId) {
    try {
      const transcribed = await transcribeProjectAudio(project);
      return {
        audioAssetId,
        source: 'whisper',
        language: transcribed.language,
        words: transcribed.words,
        lines: alignLyricsToWords(project.lyrics, transcribed.words, project.durationSeconds),
        createdAt: nowIso(),
      };
    } catch (error) {
      console.warn('[lyric-sync] whisper failed, estimating from lyrics', error);
    }
  }

  return {
    ...estimateLyricAlignment(project.lyrics, project.durationSeconds),
    audioAssetId,
  };
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
