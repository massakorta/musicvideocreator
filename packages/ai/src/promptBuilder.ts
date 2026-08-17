import type {
  CharacterDefinition,
  EnvironmentDefinition,
  StoryboardScene,
  VisualBible,
  VisualStylePreset,
} from '@music-video/shared';

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
  const characters = scene.characters
    .map((id) => bible.characters.find((c) => c.id === id))
    .filter((c): c is CharacterDefinition => Boolean(c));
  const environment = bible.environments.find((e) => e.id === scene.environmentId);

  const characterBlock = characters
    .map((c) => characterContinuityBlock(c))
    .join('\n');

  const environmentBlock = environment ? environmentContinuityBlock(environment) : 'No specific location locked.';

  const palette = bible.colorPalette.map((c) => `${c.name} (${c.hex}) for ${c.usage}`).join('; ');

  const prompt = [
    bible.masterPrompt,
    `Visual style preset: ${style.name}. ${style.promptInstructions}`,
    `Overall medium: ${bible.overallStyle.visualMedium}. Mood: ${bible.overallStyle.mood}. Rendering: ${bible.overallStyle.renderingStyle}.`,
    `Continuity rules: ${bible.continuityRules.join(' ')}`,
    `Color palette: ${palette}.`,
    environmentBlock,
    characterBlock || 'No named characters in this frame.',
    `Scene title: ${scene.title}.`,
    `Frozen visual moment: ${scene.description}`,
    `Action freeze: ${scene.action}`,
    scene.visualComedy ? `Visual gag: ${scene.visualComedy}` : '',
    `Camera: ${scene.shotType}, ${scene.cameraIntent}. 16:9 cinematic still, subject has breathing room on all sides so a Ken Burns zoom will not crop faces. Slightly wider composition than a tight poster crop.`,
    `User image prompt notes: ${scene.imagePrompt}`,
    input.extraInstructions ?? '',
    'Single still image. No collage. No panels. No text, letters, captions, speech bubbles, watermarks, or logos.',
  ]
    .filter(Boolean)
    .join('\n');

  const negativePrompt = [
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
  return [
    bible.masterPrompt,
    style.promptInstructions,
    'Character reference sheet, single clearly adult character, full body, standing in a neutral three-quarter pose, clear readable face, costume fully visible, plain or softly lit backdrop, 16:9.',
    characterContinuityBlock(character),
    `Personality readable in posture: ${character.personality}.`,
    'Family-friendly illustrated cartoon. No other characters. No text. No labels. No turnaround grid unless it stays one cohesive image.',
  ].join('\n');
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
