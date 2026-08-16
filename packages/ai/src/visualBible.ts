import type { VisualBible, VisualStylePreset } from '@music-video/shared';
import { parseLyricSections } from '@music-video/shared';
import type OpenAI from 'openai';
import { completeStructured } from './openaiClient.js';
import { aiVisualBibleSchema, type AiVisualBible } from './schemas.js';

export const VISUAL_BIBLE_SYSTEM = `You are the production designer and art director for an original music video.

Return a Visual Bible as structured JSON.

Rules:
- Invent original characters and locations inspired by the lyrics. Do not copy existing copyrighted characters.
- Keep character counts small and memorable (2-5 major characters).
- Clothing and faces must be specific enough to reuse across dozens of stills.
- Continuity rules should be concrete (same coat, same scar, same kitchen tiles).
- Negative rules should prevent style drift, extra characters, text, and photorealism when the style is illustrated.
- masterPrompt must be a reusable paragraph that can prefix every later image prompt.
- Color palette hex values must be valid CSS hex colors.
- Character and environment ids must be kebab-case slugs.
- This video will be made from STILL images with camera moves, not animated character acting. Design looks that read as strong frozen frames.`;

export async function generateVisualBible(options: {
  client: OpenAI;
  model: string;
  projectTitle: string;
  lyrics: string;
  durationSeconds: number;
  style: VisualStylePreset;
}): Promise<{ bible: VisualBible; usage?: OpenAI.Completions.CompletionUsage }> {
  const sections = parseLyricSections(options.lyrics)
    .map((s) => `[${s.label}]\n${s.lines.join('\n')}`)
    .join('\n\n');

  const user = `Project title: ${options.projectTitle}
Song length: ${options.durationSeconds.toFixed(1)} seconds
Visual style: ${options.style.name}
Style instructions: ${options.style.promptInstructions}
Color mood: ${options.style.defaultColorMood}

Lyrics (preserve section labels):
${sections || options.lyrics}

Create the visual bible.`;

  const { data, usage } = await completeStructured<AiVisualBible>(options.client, {
    model: options.model,
    schema: aiVisualBibleSchema,
    schemaName: 'visual_bible',
    system: VISUAL_BIBLE_SYSTEM,
    user,
  });

  const bible: VisualBible = {
    ...data,
    characters: data.characters.map((c) => ({
      ...c,
      ageAppearance: c.ageAppearance ?? undefined,
      lockedReferenceImage: false,
    })),
  };

  return { bible, usage };
}
