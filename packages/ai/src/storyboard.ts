import {
  parseLyricSections,
  reindexScenes,
  sceneSlotsFromAlignment,
  selectMotion,
  selectTransition,
  suggestedSceneCount,
  type LyricAlignment,
  type MotionPresetId,
  type SceneTimingSlot,
  type StoryboardScene,
  type VisualBible,
  type VisualStylePreset,
} from '@music-video/shared';
import type OpenAI from 'openai';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { completeStructured } from './openaiClient.js';
import { buildSceneImagePrompt } from './promptBuilder.js';
import { aiStoryboardSceneSchema, type AiStoryboard } from './schemas.js';

export const STORYBOARD_SYSTEM = `You are a professional music video director and storyboard artist.

This production uses STILL images only. Camera moves (Ken Burns zoom/pan/shake) will animate each still. You must design frozen moments, not action sequences.

GOOD: "Jens frozen mid-slip on the herring, arms spread, soup flying through the air."
BAD: "Jens walks through five rooms, picks up a bowl, cooks soup, argues with the captain and falls down."

Requirements:
- The TIMED BEATS are locked to the actual song. Copy each beat's startTime, endTime, songSection, and lyricsExcerpt exactly.
- Create exactly one scene per timed beat, in the same order.
- The still must illustrate THAT lyric or instrumental moment — not a generic mood board of the whole song.
- Use lyrical structure: intros establish, verses tell, choruses repeat a recognizable visual motif but escalate, bridges shift mood, outros resolve.
- Do not illustrate every lyric word literally. Find cinematic metaphors and, where the style allows, visual jokes.
- Recurring characters must stay consistent. Use only character ids and environment ids from the visual bible.
- Vary shot types. Do not stack three identical close-ups.
- Each scene is one strong still suitable for Ken Burns motion.
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
  alignment?: LyricAlignment;
}): Promise<{ scenes: StoryboardScene[]; usage?: OpenAI.Completions.CompletionUsage }> {
  const slots = options.alignment
    ? sceneSlotsFromAlignment(options.alignment, options.durationSeconds)
    : [];
  const { min, max, target } = suggestedSceneCount(options.durationSeconds);
  const sections = parseLyricSections(options.lyrics)
    .map((s) => `[${s.label}]\n${s.lines.join('\n')}`)
    .join('\n\n');

  const characterList = options.bible.characters.map((c) => `${c.id}: ${c.name} (${c.role})`).join('\n');
  const environmentList = options.bible.environments.map((e) => `${e.id}: ${e.name}`).join('\n');
  const beatList = slots
    .map((slot, index) => {
      const lyric = slot.lyricsExcerpt ? ` lyrics: "${slot.lyricsExcerpt}"` : ' instrumental';
      return `${index + 1}. ${slot.startTime.toFixed(2)}–${slot.endTime.toFixed(2)} ${slot.songSection}${lyric}`;
    })
    .join('\n');

  const user = `Project: ${options.projectTitle}
Duration seconds: ${options.durationSeconds}
Requested scene count: ${slots.length || `target ${target} (min ${min}, max ${max})`}
Style: ${options.style.name} — ${options.style.promptInstructions}

Characters:
${characterList}

Environments:
${environmentList}

Visual bible mood: ${options.bible.overallStyle.mood}
Camera language: ${options.bible.overallStyle.cameraLanguage}

Lyrics:
${sections || options.lyrics}

${
  beatList
    ? `TIMED BEATS FROM THE ACTUAL SONG (locked — do not invent new times):\n${beatList}\n\nCreate exactly ${slots.length} scenes, one per beat, using those start/end times.`
    : `Create the complete storyboard covering 0 to ${options.durationSeconds}.`
}`;

  const schema =
    slots.length > 0
      ? z.object({
          scenes: z
            .array(aiStoryboardSceneSchema)
            .min(Math.max(1, slots.length - 4))
            .max(slots.length + 4),
        })
      : z.object({
          scenes: z.array(aiStoryboardSceneSchema).min(min).max(max),
        });

  const { data, usage } = await completeStructured<AiStoryboard>(options.client, {
    model: options.model,
    schema,
    schemaName: 'storyboard',
    system: STORYBOARD_SYSTEM,
    user,
    temperature: 0.75,
  });

  const motions: MotionPresetId[] = [];
  const scenes =
    slots.length > 0
      ? scenesFromSlots(slots, data.scenes, options)
      : normalizeStoryboardTiming(
          data.scenes.map((scene, index) => {
            const mapped = mapAiScene(scene, index, options, undefined, motions);
            motions.push(mapped.motion);
            return mapped;
          }),
          options.durationSeconds,
        );

  return { scenes: reindexScenes(scenes), usage };
}

export function scenesFromSlots(
  slots: SceneTimingSlot[],
  aiScenes: AiStoryboard['scenes'],
  options: {
    style: VisualStylePreset;
    bible: VisualBible;
  },
): StoryboardScene[] {
  const motions: MotionPresetId[] = [];
  return slots.map((slot, index) => {
    const ai = aiScenes[index] ?? aiScenes.at(-1);
    const fallback = fallbackAiScene(slot, index);
    const mapped = mapAiScene(ai ?? fallback, index, options, slot, motions);
    motions.push(mapped.motion);
    return mapped;
  });
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

function mapAiScene(
  scene: AiStoryboard['scenes'][number],
  index: number,
  options: { style: VisualStylePreset; bible: VisualBible },
  slot?: SceneTimingSlot,
  previousMotions: MotionPresetId[] = [],
): StoryboardScene {
  const startTime = slot?.startTime ?? scene.startTime;
  const endTime = slot?.endTime ?? scene.endTime;
  const songSection = slot?.songSection ?? scene.songSection;
  const motion = selectMotion({
    shotType: scene.shotType,
    songSection,
    suggested: scene.suggestedMotion,
    previousMotions,
    visualComedy: scene.visualComedy ?? undefined,
    cameraIntent: scene.cameraIntent,
    motionIntensity: options.style.defaultMotionIntensity,
  });
  const mapped: StoryboardScene = {
    id: randomUUID(),
    order: index + 1,
    startTime,
    endTime,
    duration: endTime - startTime,
    songSection,
    lyricsExcerpt: slot?.lyricsExcerpt ?? scene.lyricsExcerpt ?? undefined,
    title: scene.title || slot?.title || `Scene ${index + 1}`,
    description: scene.description,
    action: scene.action,
    characters: scene.characterIds.filter((cid) => options.bible.characters.some((c) => c.id === cid)),
    environmentId: scene.environmentId ?? undefined,
    shotType: scene.shotType,
    cameraIntent: scene.cameraIntent,
    visualComedy: scene.visualComedy ?? undefined,
    imagePrompt: scene.imagePrompt,
    negativePrompt: scene.negativePrompt ?? undefined,
    suggestedMotion: scene.suggestedMotion,
    motion,
    transitionIn: scene.transitionIn,
    transitionOut: scene.transitionOut || selectTransition(songSection),
    mediaType: 'image',
    previousAssetIds: [],
    previousVideoAssetIds: [],
    generationState: 'pending',
    videoGenerationState: 'pending',
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
}

function fallbackAiScene(slot: SceneTimingSlot, index: number): AiStoryboard['scenes'][number] {
  const lyric = slot.lyricsExcerpt ? `the line “${slot.lyricsExcerpt}”` : 'this instrumental passage';
  return {
    order: index + 1,
    startTime: slot.startTime,
    endTime: slot.endTime,
    songSection: slot.songSection,
    lyricsExcerpt: slot.lyricsExcerpt ?? null,
    title: slot.title,
    description: `A frozen cinematic still for ${lyric}.`,
    action: 'A single held pose, ready for Ken Burns motion.',
    characterIds: [],
    environmentId: null,
    shotType: index % 2 === 0 ? 'wide' : 'medium',
    cameraIntent: 'Hold the moment, gentle drift',
    visualComedy: null,
    imagePrompt: `Cinematic still illustrating ${lyric}`,
    negativePrompt: null,
    suggestedMotion: 'slowZoomIn',
    transitionIn: 'cut',
    transitionOut: 'cut',
  };
}
