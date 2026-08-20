import type { StoryboardScene } from '@music-video/shared';
import { softenSceneTextForSafety } from '@music-video/shared';
import type OpenAI from 'openai';
import { z } from 'zod';
import { completeStructured } from './openaiClient.js';

export type SafeSceneCopyTarget = 'description' | 'imagePrompt' | 'all';

export const safeSceneTextSchema = z.object({
  description: z.string().min(1),
  action: z.string().min(1),
  imagePrompt: z.string().min(1),
  visualComedy: z.string().nullable(),
});

export type SafeSceneText = z.infer<typeof safeSceneTextSchema>;

export const SCENE_SAFETY_SYSTEM = `You rewrite music-video storyboard scene text so family-friendly cartoon still-image generators accept it.

Keep the same characters, lyric beat, and visual gag. Change only wording that tends to trigger image safety filters.

Guidelines:
- smoking, smoldering, charred, burnt, or blackened food or hair → cartoon steam, tousled hair, or overcooked silly cartoon food
- sizzling, scalding, hot liquid on skin or toes → splashing cartoon soup, surprised reaction, no injury detail
- breaking teeth, bending teeth, or dental distress → tough-food slapstick, wide cartoon grins, no dental injury
- kid-friendly or child-safe phrasing → family-friendly
- blood, weapons, death, or realistic violence → slapstick cartoon equivalents
- minors or young children → clearly adult characters only
- suggestive or NSFW wording → neutral, fully clothed, slapstick tone
- avoid body-part close-ups (toes, feet) — describe shoes, boots, or full-body slapstick instead

Write concise director notes, not full image prompts. Do not add on-image text, logos, or captions.
Return every schema field. Use null for visualComedy when there is no visual gag.`;

function fieldsToRewrite(target: SafeSceneCopyTarget): string {
  if (target === 'description') {
    return 'Rewrite description, action, and visualComedy. Copy imagePrompt unchanged.';
  }
  if (target === 'imagePrompt') {
    return 'Rewrite imagePrompt only. Copy description, action, and visualComedy unchanged.';
  }
  return 'Rewrite description, action, visualComedy, and imagePrompt.';
}

export function rewriteSceneTextLocallyForSafety(
  scene: Pick<StoryboardScene, 'description' | 'action' | 'imagePrompt' | 'visualComedy'>,
  target: SafeSceneCopyTarget,
): SafeSceneText {
  const soften = (text: string) => softenSceneTextForSafety(text);
  if (target === 'imagePrompt') {
    return {
      description: scene.description,
      action: scene.action,
      imagePrompt: soften(scene.imagePrompt),
      visualComedy: scene.visualComedy ?? null,
    };
  }
  if (target === 'description') {
    return {
      description: soften(scene.description),
      action: soften(scene.action),
      imagePrompt: scene.imagePrompt,
      visualComedy: scene.visualComedy ? soften(scene.visualComedy) : null,
    };
  }
  return {
    description: soften(scene.description),
    action: soften(scene.action),
    imagePrompt: soften(scene.imagePrompt),
    visualComedy: scene.visualComedy ? soften(scene.visualComedy) : null,
  };
}

export async function rewriteSceneForImageSafety(options: {
  client: OpenAI;
  model: string;
  scene: Pick<
    StoryboardScene,
    'title' | 'description' | 'action' | 'visualComedy' | 'imagePrompt' | 'lyricsExcerpt'
  >;
  target: SafeSceneCopyTarget;
  styleName?: string;
}): Promise<{ text: SafeSceneText; usage?: OpenAI.Completions.CompletionUsage }> {
  const { scene, target } = options;
  const user = [
    options.styleName ? `Style: ${options.styleName}` : '',
    `Scene title: ${scene.title}`,
    scene.lyricsExcerpt ? `Lyrics excerpt: "${scene.lyricsExcerpt}"` : '',
    '',
    fieldsToRewrite(target),
    '',
    `description: ${scene.description}`,
    `action: ${scene.action}`,
    scene.visualComedy ? `visualComedy: ${scene.visualComedy}` : 'visualComedy: null',
    `imagePrompt: ${scene.imagePrompt}`,
  ]
    .filter(Boolean)
    .join('\n');

  const { data, usage } = await completeStructured(options.client, {
    model: options.model,
    schema: safeSceneTextSchema,
    schemaName: 'safe_scene_text',
    system: SCENE_SAFETY_SYSTEM,
    user,
    temperature: 0.4,
  });

  return { text: data, usage };
}
