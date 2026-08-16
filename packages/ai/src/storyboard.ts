import {
  parseLyricSections,
  reindexScenes,
  selectMotion,
  selectTransition,
  suggestedSceneCount,
  type MotionPresetId,
  type StoryboardScene,
  type VisualBible,
  type VisualStylePreset,
} from '@music-video/shared';
import type OpenAI from 'openai';
import { randomUUID } from 'node:crypto';
import { completeStructured } from './openaiClient.js';
import { buildSceneImagePrompt } from './promptBuilder.js';
import { aiStoryboardSchema, type AiStoryboard } from './schemas.js';

export const STORYBOARD_SYSTEM = `You are a professional music video director and storyboard artist.

This production uses STILL images only. Camera moves (Ken Burns zoom/pan/shake) will animate each still. You must design frozen moments, not action sequences.

GOOD: "Jens frozen mid-slip on the herring, arms spread, soup flying through the air."
BAD: "Jens walks through five rooms, picks up a bowl, cooks soup, argues with the captain and falls down."

Requirements:
- Cover the COMPLETE song from 0.0 to durationSeconds with no gaps and no overlaps.
- Scene count should be near the requested target. A longer song needs more scenes.
- Use lyrical structure: intros establish, verses tell, choruses repeat a recognizable visual motif but escalate, bridges shift mood, outros resolve.
- Do not illustrate every lyric word literally. Find cinematic metaphors and, where the style allows, visual jokes.
- Recurring characters must stay consistent. Use only character ids and environment ids from the visual bible.
- Vary shot types. Do not stack three identical close-ups.
- Each scene is one strong still suitable for Ken Burns motion.
- Timing is in seconds with 2-3 decimal precision. Adjacent scenes must meet: scene[n].endTime == scene[n+1].startTime.
- First startTime is 0. Last endTime equals durationSeconds.
- suggestedMotion must be one of the allowed motion presets.
- Keep imagePrompt as additional scene-specific notes, not a full dump of the bible.`;

export async function generateStoryboard(options: {
  client: OpenAI;
  model: string;
  projectTitle: string;
  lyrics: string;
  durationSeconds: number;
  style: VisualStylePreset;
  bible: VisualBible;
}): Promise<{ scenes: StoryboardScene[]; usage?: OpenAI.Completions.CompletionUsage }> {
  const { min, max, target } = suggestedSceneCount(options.durationSeconds);
  const sections = parseLyricSections(options.lyrics)
    .map((s) => `[${s.label}]\n${s.lines.join('\n')}`)
    .join('\n\n');

  const characterList = options.bible.characters.map((c) => `${c.id}: ${c.name} (${c.role})`).join('\n');
  const environmentList = options.bible.environments.map((e) => `${e.id}: ${e.name}`).join('\n');

  const user = `Project: ${options.projectTitle}
Duration seconds: ${options.durationSeconds}
Requested scene count: target ${target} (min ${min}, max ${max})
Style: ${options.style.name} — ${options.style.promptInstructions}

Characters:
${characterList}

Environments:
${environmentList}

Visual bible mood: ${options.bible.overallStyle.mood}
Camera language: ${options.bible.overallStyle.cameraLanguage}

Lyrics:
${sections || options.lyrics}

Create the complete storyboard covering 0 to ${options.durationSeconds}.`;

  const { data, usage } = await completeStructured<AiStoryboard>(options.client, {
    model: options.model,
    schema: aiStoryboardSchema,
    schemaName: 'storyboard',
    system: STORYBOARD_SYSTEM,
    user,
    temperature: 0.8,
  });

  const motions: MotionPresetId[] = [];
  const raw: StoryboardScene[] = data.scenes.map((scene, index) => {
    const id = randomUUID();
    const motion = selectMotion({
      shotType: scene.shotType,
      songSection: scene.songSection,
      suggested: scene.suggestedMotion,
      previousMotions: motions,
      visualComedy: scene.visualComedy,
      cameraIntent: scene.cameraIntent,
      motionIntensity: options.style.defaultMotionIntensity,
    });
    motions.push(motion);
    const next = data.scenes[index + 1];
    const transitionOut = scene.transitionOut || selectTransition(scene.songSection, next?.songSection);
    const mapped: StoryboardScene = {
      id,
      order: scene.order,
      startTime: scene.startTime,
      endTime: scene.endTime,
      duration: scene.endTime - scene.startTime,
      songSection: scene.songSection,
      lyricsExcerpt: scene.lyricsExcerpt,
      title: scene.title,
      description: scene.description,
      action: scene.action,
      characters: scene.characterIds.filter((cid) => options.bible.characters.some((c) => c.id === cid)),
      environmentId: scene.environmentId,
      shotType: scene.shotType,
      cameraIntent: scene.cameraIntent,
      visualComedy: scene.visualComedy,
      imagePrompt: scene.imagePrompt,
      negativePrompt: scene.negativePrompt,
      suggestedMotion: scene.suggestedMotion,
      motion,
      transitionIn: scene.transitionIn,
      transitionOut,
      mediaType: 'image',
      previousAssetIds: [],
      generationState: 'pending',
      approved: false,
    };
    const built = buildSceneImagePrompt({
      style: options.style,
      bible: options.bible,
      scene: mapped,
    });
    mapped.imagePrompt = scene.imagePrompt;
    mapped.negativePrompt = built.negativePrompt;
    return mapped;
  });

  const normalized = normalizeStoryboardTiming(raw, options.durationSeconds);
  return { scenes: reindexScenes(normalized), usage };
}

export function normalizeStoryboardTiming(scenes: StoryboardScene[], durationSeconds: number): StoryboardScene[] {
  if (scenes.length === 0) return scenes;
  const sorted = [...scenes].sort((a, b) => a.startTime - b.startTime || a.order - b.order);
  const first = sorted[0]!;
  first.startTime = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    const scene = sorted[i]!;
    const next = sorted[i + 1];
    if (next) {
      const midpoint = (scene.endTime + next.startTime) / 2;
      scene.endTime = midpoint;
      next.startTime = midpoint;
    } else {
      scene.endTime = durationSeconds;
    }
    if (scene.endTime <= scene.startTime) {
      scene.endTime = scene.startTime + 0.4;
    }
    scene.duration = scene.endTime - scene.startTime;
  }
  const last = sorted[sorted.length - 1]!;
  if (last.endTime > durationSeconds) {
    last.endTime = durationSeconds;
    last.duration = Math.max(0.2, last.endTime - last.startTime);
  }
  return sorted;
}
