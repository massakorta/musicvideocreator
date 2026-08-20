import type {
  CharacterDefinition,
  EnvironmentDefinition,
  StoryboardScene,
  VisualBible,
  VisualStylePreset,
} from '@music-video/shared';
import { softenSceneTextForSafety, styleRenderMode, normalizeMotionPreset, type StyleRenderMode } from '@music-video/shared';

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
    | 'suggestedMotion'
    | 'songSection'
    | 'lyricsExcerpt'
  >;
  extraInstructions?: string;
}

export function buildSceneVideoPrompt(input: SceneImagePromptInput): {
  prompt: string;
  negativePrompt: string;
} {
  const { style, bible, scene } = input;
  const motionHint = motionLanguageForVideo(scene.suggestedMotion, scene.cameraIntent);
  const imageNegative = buildSceneImagePrompt(input).negativePrompt;
  const storyMoment = storyMomentLine(scene);
  const characterBeat = characterBeatForVideo(bible, scene);
  const environmentHint = environmentHintForVideo(bible, scene.environmentId);
  const storyMotion = storyMotionDirection(scene);

  const prompt = [
    `${style.name} music video clip.`,
    bible.overallStyle.mood ? `Mood: ${bible.overallStyle.mood}.` : '',
    storyMoment,
    `Scene: ${scene.title}. ${scene.description}`,
    `Story beat: ${scene.action}.`,
    scene.visualComedy ? `Visual gag: ${scene.visualComedy}.` : '',
    characterBeat,
    environmentHint,
    storyMotion,
    motionHint,
    'Subtle in-place motion only. Same frame, same characters, same environment.',
    'Animate the story beat with natural micro-movement tied to the gag and lyric moment — fabric sway, liquid wobble, steam, light flicker, hair drift, breathing, weight shift.',
    scene.imagePrompt ? `Notes: ${scene.imagePrompt}` : '',
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2000);

  const negativePrompt = [
    imageNegative,
    'face morphing, identity change, extra limbs, new characters, scene change, cut, zoom to different location, on-screen text, subtitles, watermark, logo',
  ]
    .filter(Boolean)
    .join(', ')
    .slice(0, 1000);

  return { prompt, negativePrompt };
}

function storyMomentLine(
  scene: Pick<StoryboardScene, 'songSection' | 'lyricsExcerpt'>,
): string {
  const section = scene.songSection.replace(/_/g, ' ');
  if (scene.lyricsExcerpt?.trim()) {
    return `This ${section} moment matches the lyric: "${scene.lyricsExcerpt.trim()}".`;
  }
  return `Instrumental ${section} passage.`;
}

function characterBeatForVideo(bible: VisualBible, scene: Pick<StoryboardScene, 'characters' | 'action'>): string {
  const characters = scene.characters
    .map((id) => bible.characters.find((c) => c.id === id))
    .filter((c): c is CharacterDefinition => Boolean(c));
  if (characters.length === 0) return '';
  const beats = characters.map(
    (c) => `${c.name} (${c.role}): ${c.promptDescription}. Hold the beat: ${scene.action}.`,
  );
  return `Characters in frame: ${beats.join(' ')}`;
}

function environmentHintForVideo(bible: VisualBible, environmentId?: string): string {
  if (!environmentId) return '';
  const environment = bible.environments.find((e) => e.id === environmentId);
  if (!environment) return '';
  return `Setting: ${environment.name} — ${environment.promptDescription}.`;
}

function storyMotionDirection(scene: Pick<StoryboardScene, 'action' | 'visualComedy'>): string {
  const parts: string[] = [];
  if (scene.visualComedy) {
    parts.push(`Motion should play the gag (${scene.visualComedy}) without changing the composition.`);
  }
  if (scene.action) {
    parts.push(`Sell the frozen action (${scene.action}) with subtle movement, not a new pose or cut.`);
  }
  return parts.join(' ');
}

function motionLanguageForVideo(
  motion: StoryboardScene['suggestedMotion'],
  cameraIntent: string,
): string {
  const preset = normalizeMotionPreset(motion);
  const map: Partial<Record<ReturnType<typeof normalizeMotionPreset>, string>> = {
    static: 'Hold the frame steady with only ambient environmental motion.',
    slowZoomIn: 'Very slow push-in on the same subject, barely perceptible.',
    slowZoomOut: 'Very slow pull-back while keeping the same framing.',
    panLeft: 'Gentle horizontal drift left across the same scene.',
    panRight: 'Gentle horizontal drift right across the same scene.',
    panUp: 'Subtle upward drift within the same composition.',
    panDown: 'Subtle downward drift within the same composition.',
    zoomPanLeft: 'Slow zoom with a slight left drift, same scene.',
    zoomPanRight: 'Slow zoom with a slight right drift, same scene.',
    subtleRotateClockwise: 'Barely perceptible clockwise drift, same scene.',
    subtleRotateCounterClockwise: 'Barely perceptible counter-clockwise drift, same scene.',
    gentleDrift: 'Soft floating camera drift within the same frame.',
    dramaticZoom: 'Cinematic slow push-in, same subject and scene.',
    punchZoom: 'Quick but controlled punch-in on the same subject.',
  };
  return `Camera motion: ${map[preset] ?? 'Gentle cinematic drift.'} Director intent: ${cameraIntent}.`;
}

export function buildSceneImagePrompt(input: SceneImagePromptInput): {
  prompt: string;
  negativePrompt: string;
} {
  const { style, bible } = input;
  const scene = softenSceneFields(input.scene);
  const renderMode = styleRenderMode(style);
  const characters = scene.characters
    .map((id) => bible.characters.find((c) => c.id === id))
    .filter((c): c is CharacterDefinition => Boolean(c));
  const environment = bible.environments.find((e) => e.id === scene.environmentId);

  const characterBlock = characters
    .map((c) => characterContinuityBlock(softenCharacter(c)))
    .join('\n');

  const environmentBlock = environment ? environmentContinuityBlock(softenEnvironment(environment)) : 'No specific location locked.';

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
    `Continuity rules: ${bible.continuityRules.map((rule) => softenSceneTextForSafety(rule)).join(' ')}`,
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

/** Last-resort still prompt when fal rejects richer scene copy. */
export function buildMinimalSafeSceneImagePrompt(input: SceneImagePromptInput): string {
  const { style } = input;
  const scene = softenSceneFields(input.scene);
  return [
    `${style.name}: family-friendly illustrated cartoon still.`,
    style.promptInstructions,
    `Scene: ${scene.title}. ${scene.description}`,
    scene.action ? `Peak pose: ${scene.action}.` : '',
    scene.visualComedy ? `Gag: ${scene.visualComedy}.` : '',
    scene.imagePrompt ? `Notes: ${scene.imagePrompt}.` : '',
    'Clearly adult cartoon characters only. Slapstick comedy. Fully clothed. No text, logos, or realistic violence.',
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1500);
}

/** Ultra-minimal prompt when fal still rejects — drops body-contact and heat-injury detail. */
export function buildUltraMinimalSafeSceneImagePrompt(input: SceneImagePromptInput): string {
  const { style } = input;
  const scene = softenSceneFields(input.scene);
  return [
    `${style.name} family-friendly cartoon illustration.`,
    `Slapstick comedy kitchen moment inspired by: ${scene.title}.`,
    'Two adult cartoon characters with exaggerated surprised expressions.',
    'Splashing cartoon soup gag. Fully clothed. Thick ink outlines. Bright colors.',
    'No text, logos, realistic injury, or body-focused framing.',
  ]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 800);
}

function softenSceneFields<T extends Pick<
  StoryboardScene,
  'title' | 'description' | 'action' | 'visualComedy' | 'imagePrompt' | 'cameraIntent' | 'lyricsExcerpt'
>>(scene: T): T {
  return {
    ...scene,
    title: softenSceneTextForSafety(scene.title),
    description: softenSceneTextForSafety(scene.description),
    action: softenSceneTextForSafety(scene.action),
    visualComedy: scene.visualComedy ? softenSceneTextForSafety(scene.visualComedy) : scene.visualComedy,
    imagePrompt: softenSceneTextForSafety(scene.imagePrompt),
    cameraIntent: softenSceneTextForSafety(scene.cameraIntent),
    lyricsExcerpt: scene.lyricsExcerpt ? softenSceneTextForSafety(scene.lyricsExcerpt) : scene.lyricsExcerpt,
  };
}

function softenCharacter(character: CharacterDefinition): CharacterDefinition {
  return {
    ...character,
    promptDescription: softenSceneTextForSafety(character.promptDescription),
    bodyType: softenSceneTextForSafety(character.bodyType),
    face: softenSceneTextForSafety(character.face),
    hair: softenSceneTextForSafety(character.hair),
    clothing: softenSceneTextForSafety(character.clothing),
    personality: softenSceneTextForSafety(character.personality),
    ageAppearance: character.ageAppearance ? softenSceneTextForSafety(character.ageAppearance) : character.ageAppearance,
  };
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
    softenSceneTextForSafety(bible.masterPrompt),
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

function softenEnvironment(environment: EnvironmentDefinition): EnvironmentDefinition {
  return {
    ...environment,
    description: softenSceneTextForSafety(environment.description),
    promptDescription: softenSceneTextForSafety(environment.promptDescription),
    layout: softenSceneTextForSafety(environment.layout),
    lighting: softenSceneTextForSafety(environment.lighting),
    materials: environment.materials.map((item) => softenSceneTextForSafety(item)),
    importantObjects: environment.importantObjects.map((item) => softenSceneTextForSafety(item)),
    continuityFeatures: environment.continuityFeatures.map((item) => softenSceneTextForSafety(item)),
  };
}
