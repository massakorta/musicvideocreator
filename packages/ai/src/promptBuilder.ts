import type {
  CharacterDefinition,
  EnvironmentDefinition,
  StoryboardScene,
  VisualBible,
  VisualStylePreset,
} from '@music-video/shared';
import { styleRenderMode, type StyleRenderMode } from '@music-video/shared';

export interface SceneImagePromptInput {
  style: VisualStylePreset;
  bible: VisualBible;
  scene: Pick<
    StoryboardScene,
    | 'title'
    | 'description'
    | 'action'
    | 'shotType'
    | 'cameraIntent'
    | 'visualComedy'
    | 'imagePrompt'
    | 'characters'
    | 'environmentId'
    | 'negativePrompt'
  >;
  extraInstructions?: string;
}

export function buildSceneImagePrompt(input: SceneImagePromptInput): {
  prompt: string;
  negativePrompt: string;
} {
  const { style, bible, scene } = input;
  const renderMode = styleRenderMode(style);
  const characters = scene.characters
    .map((id) => bible.characters.find((c) => c.id === id))
    .filter((c): c is CharacterDefinition => Boolean(c));
  const environment = bible.environments.find((e) => e.id === scene.environmentId);

  const characterBlock = characters
    .map((c) => characterContinuityBlock(c))
    .join('\n');

  const environmentBlock = environment ? environmentContinuityBlock(environment) : 'No specific location locked.';

  const palette = bible.colorPalette.map((c) => `${c.name} (${c.hex}) for ${c.usage}`).join('; ');

  const styleLock = buildStyleLock(style, bible, renderMode);
  const frameLine = frameCompositionLine(renderMode);

  const prompt = [
    styleLock,
    `Frozen visual moment: ${scene.description}`,
    `Action freeze: ${scene.action}`,
    `Scene title: ${scene.title}.`,
    characterBlock || 'No named characters in this frame.',
    environmentBlock,
    scene.visualComedy ? `Visual gag: ${scene.visualComedy}` : '',
    `Camera: ${scene.shotType}, ${scene.cameraIntent}. ${frameLine}`,
    `User image prompt notes: ${scene.imagePrompt}`,
    input.extraInstructions ?? '',
    `Continuity rules: ${bible.continuityRules.join(' ')}`,
    `Color palette: ${palette}.`,
    'Single still image. No collage. No panels. No text, letters, captions, speech bubbles, watermarks, or logos.',
  ]
    .filter(Boolean)
    .join('\n');

  const negativePrompt = [
    ...styleNegativeRules(style, renderMode),
    ...(bible.negativeRules ?? []),
    scene.negativePrompt ?? '',
    'text, watermark, logo, speech bubble, split screen, storyboard arrows, extra limbs, morphing faces, different outfit unless specified',
  ]
    .filter(Boolean)
    .join(', ');

  return { prompt, negativePrompt };
}

export function buildCharacterReferencePrompt(
  character: CharacterDefinition,
  bible: VisualBible,
  style: VisualStylePreset,
): string {
  const renderMode = styleRenderMode(style);
  return [
    buildStyleLock(style, bible, renderMode),
    characterContinuityBlock(character),
    `Personality readable in posture: ${character.personality}.`,
    characterReferenceLine(renderMode),
    'No other characters. No text. No labels. No turnaround grid unless it stays one cohesive image.',
  ].join('\n');
}

export function buildCharacterImageNegative(style: VisualStylePreset, bible: VisualBible): string {
  return [
    ...styleNegativeRules(style, styleRenderMode(style)),
    ...(bible.negativeRules ?? []),
    'text, extra characters, collage labels, watermark, logo',
  ]
    .filter(Boolean)
    .join(', ');
}

function buildStyleLock(style: VisualStylePreset, bible: VisualBible, renderMode: StyleRenderMode): string {
  const antiPhotoreal =
    renderMode === 'illustrated'
      ? ' Painted illustration only — NOT a photograph, NOT photorealistic, NOT live action, NOT 3D CGI.'
      : '';
  return [
    `STYLE LOCK — ${style.name}: ${style.promptInstructions}`,
    bible.masterPrompt,
    `Overall medium: ${bible.overallStyle.visualMedium}. Mood: ${bible.overallStyle.mood}. Rendering: ${bible.overallStyle.renderingStyle}.`,
    antiPhotoreal,
  ]
    .filter(Boolean)
    .join(' ');
}

function frameCompositionLine(renderMode: StyleRenderMode): string {
  if (renderMode === 'illustrated') {
    return '16:9 illustrated story frame with breathing room on all sides so a Ken Burns zoom will not crop faces. Slightly wider composition than a tight poster crop.';
  }
  if (renderMode === 'photoreal') {
    return '16:9 cinematic still, subject has breathing room on all sides so a Ken Burns zoom will not crop faces. Slightly wider composition than a tight poster crop.';
  }
  return '16:9 stylized still frame with breathing room on all sides so a Ken Burns zoom will not crop faces. Slightly wider composition than a tight poster crop.';
}

function characterReferenceLine(renderMode: StyleRenderMode): string {
  if (renderMode === 'illustrated') {
    return 'Character reference sheet, single clearly adult character, full body, standing in a neutral three-quarter pose, clear readable face, costume fully visible, plain or softly lit backdrop, 16:9. Family-friendly illustrated design.';
  }
  if (renderMode === 'photoreal') {
    return 'Character reference still, single clearly adult character, full body, neutral three-quarter pose, clear readable face, costume fully visible, plain backdrop, 16:9 cinematic portrait lighting.';
  }
  return 'Character reference sheet, single clearly adult character, full body, neutral three-quarter pose, clear readable face, costume fully visible, plain backdrop, 16:9.';
}

function styleNegativeRules(style: VisualStylePreset, renderMode: StyleRenderMode): string[] {
  if (renderMode !== 'illustrated') return [];
  return [
    'photograph, photorealistic, hyperrealistic, DSLR, stock photo, live action, realistic skin pores, 3D render, CGI, Unreal Engine, octane render, ray tracing',
    `anything that breaks ${style.name} illustration style`,
  ];
}

function characterAgeLine(character: CharacterDefinition): string {
  const age = character.ageAppearance?.trim();
  if (age && !/child|kid|teen|infant|baby|toddler|minor|underage|young boy|young girl/i.test(age)) {
    return `Age appearance: ${age}.`;
  }
  return 'Clearly an adult character.';
}

export function characterContinuityBlock(character: CharacterDefinition): string {
  return [
    `Character ${character.name} (${character.role}): ${character.promptDescription}`,
    characterAgeLine(character),
    `Body: ${character.bodyType}. Face: ${character.face}. Hair: ${character.hair}. Clothing: ${character.clothing}.`,
    `Must keep: ${character.importantContinuityFeatures.join(', ')}.`,
    'Same character design, same clothing, same proportions, same face.',
  ].join(' ');
}

export function environmentContinuityBlock(environment: EnvironmentDefinition): string {
  return [
    `Location ${environment.name}: ${environment.promptDescription}`,
    `Layout: ${environment.layout}. Lighting: ${environment.lighting}. Materials: ${environment.materials.join(', ')}.`,
    `Keep: ${environment.continuityFeatures.join(', ')}.`,
    'Same environment architecture, same illustration style, same palette.',
  ].join(' ');
}
