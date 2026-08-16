export interface VisualStylePreset {
  id: string;
  name: string;
  description: string;
  promptInstructions: string;
  defaultColorMood: string;
  defaultMotionIntensity: number;
  accent: string;
  secondary: string;
}

export const VISUAL_STYLE_PRESETS: VisualStylePreset[] = [
  {
    id: 'cartoon-slapstick',
    name: 'Cartoon Slapstick',
    description: 'Elastic cartoon physics, exaggerated expressions, pastry disasters and visual gags.',
    promptInstructions:
      'Hand-painted 2D cartoon, thick ink outlines, squash-and-stretch posing frozen mid-gag, saturated but tasteful colors, expressive faces, studio-quality animation still, not 3D CGI.',
    defaultColorMood: 'warm saturated comedy',
    defaultMotionIntensity: 0.85,
    accent: '#F2C14E',
    secondary: '#E36A3F',
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    description: 'Anamorphic drama, motivated lighting, filmic color and restrained camera language.',
    promptInstructions:
      'Photoreal cinematic still, anamorphic 16:9, motivated practical lighting, shallow depth of field, film grain, naturalistic skin, no text, no watermark.',
    defaultColorMood: 'teal and tungsten',
    defaultMotionIntensity: 0.55,
    accent: '#C9A36A',
    secondary: '#4A7C8A',
  },
  {
    id: 'illustrated-storybook',
    name: 'Illustrated Storybook',
    description: 'Painted picture-book pages, soft edges, narrative compositions, gentle wonder.',
    promptInstructions:
      'Storybook illustration, gouache and colored pencil texture, soft edges, rich narrative composition, charming characters, printed-page feel, 16:9 cinematic crop.',
    defaultColorMood: 'soft watercolor warmth',
    defaultMotionIntensity: 0.45,
    accent: '#E8B86D',
    secondary: '#7BA17D',
  },
  {
    id: 'retro-1980s',
    name: 'Retro 1980s',
    description: 'Neon dusk, chrome, VHS softness, synth-era production design.',
    promptInstructions:
      '1980s retro still, neon magenta and cyan practicals, slight VHS softness, chrome details, dusk city glow, cinematic 16:9, analog film texture.',
    defaultColorMood: 'neon dusk',
    defaultMotionIntensity: 0.7,
    accent: '#FF4FD8',
    secondary: '#3DE0FF',
  },
  {
    id: 'comic-book',
    name: 'Comic Book',
    description: 'Bold ink, halftone, graphic panels captured as single heroic frames.',
    promptInstructions:
      'Graphic novel still, bold black ink, limited flat color, subtle Ben-Day dots, dramatic foreshortening, no speech bubbles, no captions, 16:9.',
    defaultColorMood: 'high-contrast ink',
    defaultMotionIntensity: 0.75,
    accent: '#E23D28',
    secondary: '#1C1C1C',
  },
  {
    id: 'stop-motion',
    name: 'Stop Motion',
    description: 'Tactile puppets, felt, clay, miniature sets with handmade lighting.',
    promptInstructions:
      'Stop-motion puppet still, tactile felt and clay textures, miniature practical set, handmade lighting, slight fabric grain, cinematic 16:9, no CGI smoothness.',
    defaultColorMood: 'handmade warm practicals',
    defaultMotionIntensity: 0.5,
    accent: '#D98A4A',
    secondary: '#6B4F3A',
  },
  {
    id: 'surreal',
    name: 'Surreal',
    description: 'Dream logic, impossible architecture, poetic metaphors instead of literal lyrics.',
    promptInstructions:
      'Surreal cinematic illustration, impossible architecture, poetic metaphor, cohesive color world, painterly realism, 16:9, no text.',
    defaultColorMood: 'dreamlike dusk',
    defaultMotionIntensity: 0.6,
    accent: '#A78BFA',
    secondary: '#34D3C9',
  },
  {
    id: 'dark-noir',
    name: 'Dark Noir',
    description: 'High-contrast shadows, wet streets, venetian blinds, moral weather.',
    promptInstructions:
      'Noir cinematic still, high-contrast chiaroscuro, wet asphalt reflections, venetian-blind light, restrained palette, 16:9 anamorphic, film grain.',
    defaultColorMood: 'monochrome with one practical color',
    defaultMotionIntensity: 0.5,
    accent: '#E8E2D6',
    secondary: '#8A1C1C',
  },
];

export function getVisualStyle(id: string | undefined | null): VisualStylePreset {
  return VISUAL_STYLE_PRESETS.find((s) => s.id === id) ?? VISUAL_STYLE_PRESETS[0]!;
}
