import { z } from 'zod';
import { MOTION_PRESETS, TRANSITION_PRESETS } from '@music-video/shared';

export const aiCharacterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  ageAppearance: z.string().optional(),
  bodyType: z.string().min(1),
  face: z.string().min(1),
  hair: z.string().min(1),
  clothing: z.string().min(1),
  colors: z.array(z.string()),
  personality: z.string().min(1),
  expressions: z.array(z.string()),
  importantContinuityFeatures: z.array(z.string()),
  promptDescription: z.string().min(1),
});

export const aiEnvironmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  layout: z.string().min(1),
  materials: z.array(z.string()),
  importantObjects: z.array(z.string()),
  lighting: z.string().min(1),
  colors: z.array(z.string()),
  continuityFeatures: z.array(z.string()),
  promptDescription: z.string().min(1),
});

export const aiVisualBibleSchema = z.object({
  projectTitle: z.string().min(1),
  overallStyle: z.object({
    visualMedium: z.string().min(1),
    mood: z.string().min(1),
    renderingStyle: z.string().min(1),
    cameraLanguage: z.string().min(1),
    animationLanguage: z.string().min(1),
  }),
  characters: z.array(aiCharacterSchema).min(1).max(8),
  environments: z.array(aiEnvironmentSchema).min(1).max(8),
  colorPalette: z
    .array(
      z.object({
        name: z.string(),
        hex: z.string(),
        usage: z.string(),
      }),
    )
    .min(4)
    .max(8),
  recurringProps: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      promptDescription: z.string(),
    }),
  ),
  continuityRules: z.array(z.string()).min(3),
  negativeRules: z.array(z.string()).min(3),
  masterPrompt: z.string().min(20),
});

export const aiStoryboardSceneSchema = z.object({
  order: z.number().int().positive(),
  startTime: z.number().nonnegative(),
  endTime: z.number().positive(),
  songSection: z.enum([
    'intro',
    'verse',
    'prechorus',
    'chorus',
    'bridge',
    'instrumental',
    'outro',
    'other',
  ]),
  lyricsExcerpt: z.string().optional(),
  title: z.string().min(1),
  description: z.string().min(1),
  action: z.string().min(1),
  characterIds: z.array(z.string()),
  environmentId: z.string().optional(),
  shotType: z.enum(['extreme-wide', 'wide', 'medium', 'close-up', 'extreme-close-up']),
  cameraIntent: z.string().min(1),
  visualComedy: z.string().optional(),
  imagePrompt: z.string().min(1),
  negativePrompt: z.string().optional(),
  suggestedMotion: z.enum(MOTION_PRESETS),
  transitionIn: z.enum(TRANSITION_PRESETS),
  transitionOut: z.enum(TRANSITION_PRESETS),
});

export const aiStoryboardSchema = z.object({
  scenes: z.array(aiStoryboardSceneSchema).min(8).max(50),
});

export type AiVisualBible = z.infer<typeof aiVisualBibleSchema>;
export type AiStoryboard = z.infer<typeof aiStoryboardSchema>;
