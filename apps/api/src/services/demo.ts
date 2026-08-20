import {
  estimateLyricAlignment,
  reindexScenes,
  sceneSlotsFromAlignment,
  selectMotion,
  selectTransition,
  type LyricAlignment,
  type MotionPresetId,
  type StoryboardScene,
  type VisualBible,
  type VisualStylePreset,
} from '@music-video/shared';
import { randomUUID } from 'node:crypto';

export function demoVisualBible(projectTitle: string, style: VisualStylePreset, lyrics: string): VisualBible {
  const names = inferNames(projectTitle, lyrics);
  const lead = names[0] ?? 'The Lead';
  const pal = paletteFor(style);
  return {
    projectTitle,
    overallStyle: {
      visualMedium: style.name,
      mood: style.defaultColorMood,
      renderingStyle: style.promptInstructions,
      cameraLanguage: 'Wide establishing shots, punch-in close-ups on gags, held stills for Ken Burns.',
      animationLanguage: 'Camera-only motion. Frozen acting poses, never walk cycles.',
    },
    characters: [
      {
        id: slug(lead),
        name: lead,
        role: 'Protagonist',
        ageAppearance: '30s',
        bodyType: 'Lanky, slightly too-long limbs, proud posture that keeps collapsing',
        face: 'Round nose, earnest eyebrows, a mouth that is always one second from disaster',
        hair: 'A stubborn tuft that refuses gravity',
        clothing: 'Sun-faded striped apron over a cream sailor sweater, rolled sleeves, scuffed clogs',
        colors: [pal[0]!.hex, pal[1]!.hex],
        personality: 'Proud, sincere, catastrophically optimistic',
        expressions: ['triumphant grin', 'mid-slip panic', 'solemn apology to a fish'],
        importantContinuityFeatures: ['striped apron', 'tuft of hair', 'clogs'],
        promptDescription: `${lead}, lanky cartoon cook in a striped apron and sailor sweater, round nose, stubborn hair tuft`,
        lockedReferenceImage: false,
      },
      {
        id: 'the-captain',
        name: 'The Captain',
        role: 'Authority',
        ageAppearance: '50s',
        bodyType: 'Barrel chest, short legs, immovable',
        face: 'Weathered, magnificent moustache, one raised eyebrow of judgment',
        hair: 'Salt-and-pepper under a cracked visor cap',
        clothing: 'Navy peacoat with brass buttons, visor cap, wool scarf',
        colors: [pal[2]!.hex, pal[3]!.hex],
        personality: 'Tired of this, still fond',
        expressions: ['slow blink', 'barely contained sigh'],
        importantContinuityFeatures: ['peacoat', 'moustache', 'visor cap'],
        promptDescription: 'Stocky captain in a navy peacoat and visor cap, magnificent moustache',
        lockedReferenceImage: false,
      },
    ],
    environments: [
      {
        id: 'galley',
        name: 'The Galley',
        description: 'A cramped ship kitchen that has seen too many experiments.',
        layout: 'Narrow corridor of counters, porthole stage-right, stove stage-left',
        materials: ['copper', 'wet wood', 'checkered tile'],
        importantObjects: ['stock pot', 'herring crate', 'cinnamon buns'],
        lighting: 'Warm practicals and a cold porthole',
        colors: pal.map((p) => p.hex),
        continuityFeatures: ['round porthole', 'copper pot battery', 'checkered floor'],
        promptDescription: 'Cramped ship galley, copper pots, checkered floor, round porthole, cinematic 16:9',
      },
      {
        id: 'deck',
        name: 'Night Deck',
        description: 'Open deck, ropes, a moon that looks slightly disappointed.',
        layout: 'Rail across the bottom third, mast left, moon high right',
        materials: ['wet teak', 'rope', 'painted steel'],
        importantObjects: ['ship wheel', 'lantern'],
        lighting: 'Moon and lantern',
        colors: pal.map((p) => p.hex),
        continuityFeatures: ['ship wheel', 'lantern', 'moon'],
        promptDescription: 'Night ship deck, wet teak, lantern, disappointed moon',
      },
    ],
    colorPalette: pal,
    recurringProps: [
      {
        id: 'herring',
        name: 'The Herring',
        description: 'A silver fish with opinions.',
        promptDescription: 'A gleaming herring, slightly too large, comic character energy',
      },
      {
        id: 'buns',
        name: 'Rock-hard cinnamon buns',
        description: 'Pastries that could be used as ballast.',
        promptDescription: 'Cartoon cinnamon buns, cracked glaze, comically dense',
      },
    ],
    continuityRules: [
      'Same character design, clothing, and proportions in every frame.',
      'The galley always has the porthole stage-right and copper pots.',
      'The herring is silver and slightly too large whenever it appears.',
      'Keep the illustration style locked to the chosen visual medium.',
    ],
    negativeRules: [
      'No photorealistic people if the style is illustrated.',
      'No text, lyrics, captions, or logos in the image.',
      'No extra unnamed characters.',
      'No multi-panel comics or storyboard arrows.',
    ],
    masterPrompt: `A ${style.name} music video still. ${style.promptInstructions} Cohesive production design, locked character wardrobe, cinematic 16:9 with breathing room for camera moves.`,
  };
}

export function demoStoryboard(
  durationSeconds: number,
  bible: VisualBible,
  lyrics: string,
  style: VisualStylePreset,
  alignment?: LyricAlignment,
): StoryboardScene[] {
  const resolved = alignment ?? estimateLyricAlignment(lyrics, durationSeconds);
  const slots = sceneSlotsFromAlignment(resolved, durationSeconds);
  const scenes: StoryboardScene[] = [];
  const motions: MotionPresetId[] = [];
  const lead = bible.characters[0]?.id;
  const captain = bible.characters[1]?.id;
  const galley = bible.environments[0]?.id;
  const deck = bible.environments[1]?.id;

  slots.forEach((slot, index) => {
    const shotCycle = ['wide', 'medium', 'close-up', 'extreme-wide', 'close-up'] as const;
    const shotType = shotCycle[index % shotCycle.length]!;
    const usingDeck = slot.songSection === 'chorus' || slot.songSection === 'outro' || slot.songSection === 'bridge';
    const motion = selectMotion({
      shotType,
      songSection: slot.songSection,
      previousMotions: motions,
      visualComedy: index % 2 === 0 ? 'frozen slapstick beat' : undefined,
    });
    motions.push(motion);
    const nextSection = slots[index + 1]?.songSection;
    scenes.push({
      id: randomUUID(),
      order: index + 1,
      startTime: slot.startTime,
      endTime: slot.endTime,
      duration: slot.endTime - slot.startTime,
      songSection: slot.songSection,
      lyricsExcerpt: slot.lyricsExcerpt,
      title: slot.title,
      description: frozenMoment(bible, slot.songSection, index, usingDeck),
      action: 'A single held pose, props frozen in mid-air if needed.',
      characters: [lead, slot.songSection === 'chorus' || index === 0 ? captain : undefined].filter(Boolean) as string[],
      environmentId: usingDeck ? deck : galley,
      shotType,
      cameraIntent: shotType.includes('close') ? 'Hold the face, slow push' : 'Establish the world, gentle drift',
      visualComedy: style.id.includes('cartoon') ? 'The disaster is already happening; nobody has noticed yet.' : undefined,
      imagePrompt: frozenMoment(bible, slot.songSection, index, usingDeck),
      suggestedMotion: motion,
      motion,
      transitionIn: selectTransition(slot.songSection),
      transitionOut: selectTransition(slot.songSection, nextSection),
      mediaType: 'image',
      previousAssetIds: [],
      previousVideoAssetIds: [],
      generationState: 'pending',
      videoGenerationState: 'pending',
      approved: false,
    });
  });

  return reindexScenes(scenes);
}

function frozenMoment(bible: VisualBible, section: string, i: number, deck: boolean): string {
  const lead = bible.characters[0]?.name ?? 'the lead';
  const place = deck ? 'on the moonlit deck' : 'in the cramped galley';
  const moments = [
    `${lead} frozen mid-presentation of rock-hard cinnamon buns ${place}, proud grin, crumbs hanging in the air.`,
    `A herring mid-leap past ${lead}'s face ${place}, eyes wide, wooden spoon held like a baton.`,
    `The captain's slow-blink close-up, moustache catching a single noodle.`,
    `${lead} holding a stock pot lid like a shield while soup hangs in a perfect arc.`,
    `Wide shot ${place}: chaos already composed, nobody moving, theatrical lighting.`,
    `${lead} offering an apology to the herring, both perfectly still, lantern bloom.`,
  ];
  return moments[(i + section.length) % moments.length]!;
}

function inferNames(title: string, lyrics: string): string[] {
  const fromTitle = title.split(/[-–—]/)[0]?.trim();
  const caps = lyrics.match(/\b[A-ZÄÖÅ][a-zäöå]{2,}\b/g) ?? [];
  const unique = [...new Set([fromTitle, ...caps].filter(Boolean))] as string[];
  return unique.slice(0, 3);
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'lead';
}

function paletteFor(style: VisualStylePreset) {
  return [
    { name: 'Key light', hex: style.accent, usage: 'hero accents' },
    { name: 'Secondary gel', hex: style.secondary, usage: 'costumes and props' },
    { name: 'Shadow teak', hex: '#2A2118', usage: 'environment shadows' },
    { name: 'Warm fill', hex: '#F1D7B0', usage: 'skin and pastry' },
    { name: 'Copper', hex: '#C4843C', usage: 'pots and practicals' },
  ];
}

export function placeholderSvg(options: {
  title: string;
  subtitle: string;
  accent: string;
  secondary: string;
  width?: number;
  height?: number;
}): Buffer {
  const width = options.width ?? 1920;
  const height = options.height ?? 1080;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${options.secondary}"/>
      <stop offset="100%" stop-color="#14110e"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <circle cx="${width * 0.78}" cy="${height * 0.22}" r="${height * 0.18}" fill="${options.accent}" opacity="0.35"/>
  <rect x="${width * 0.08}" y="${height * 0.18}" width="${width * 0.22}" height="${height * 0.64}" rx="18" fill="#000" opacity="0.22"/>
  <text x="${width * 0.12}" y="${height * 0.58}" fill="#f6efe3" font-family="Georgia, serif" font-size="64">${escapeXml(options.title)}</text>
  <text x="${width * 0.12}" y="${height * 0.68}" fill="#f2c14e" font-family="sans-serif" font-size="32">${escapeXml(options.subtitle)}</text>
</svg>`;
  return Buffer.from(svg, 'utf8');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .slice(0, 80);
}

export function makeDemoWav(durationSeconds = 32): Buffer {
  const sampleRate = 22050;
  const samples = Math.floor(sampleRate * durationSeconds);
  const headerSize = 44;
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(headerSize + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  const notes = [220, 247, 262, 294, 330, 294, 262, 247];
  for (let i = 0; i < samples; i += 1) {
    const t = i / sampleRate;
    const note = notes[Math.floor(t * 2) % notes.length]!;
    const env = Math.max(0, 1 - ((t * 2) % 1));
    const sample = Math.sin(2 * Math.PI * note * t) * 0.22 * env + Math.sin(2 * Math.PI * (note / 2) * t) * 0.08;
    buffer.writeInt16LE(Math.max(-32767, Math.min(32767, Math.floor(sample * 32767))), headerSize + i * 2);
  }
  return buffer;
}
