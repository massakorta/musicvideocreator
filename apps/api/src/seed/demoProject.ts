import {
  getVisualStyle,
  type MusicVideoProject,
} from '@music-video/shared';
import { getRepositories } from '../repositories/index.js';
import { demoStoryboard, demoVisualBible, makeDemoWav, placeholderSvg } from '../services/demo.js';
import { attachAssetToScene, saveProject, storeGeneratedFile } from '../services/projects.js';
import { newId, nowIso } from '../services/projectUtils.js';

export const DEMO_LYRICS = `[Intro]
Steam on a porthole, a kettle like a drum
The night shift kitchen is already undone

[Verse 1]
I plated the sunrise on a dented tin tray
The recipe asked for patience, I gave it today
A cinnamon fortress, a herring in flight
I swear that the galley was perfect tonight

[Chorus]
I am the proudest disaster afloat
A captain of crumbs in a secondhand coat
If the soup does a backflip, I'll take the applause
I cooked us a legend, ignoring the laws

[Verse 2]
The captain says nothing, which somehow is loud
A noodle hangs still like a question in cloud
I offer the herring a formal salute
The floor finds my clogs and the punchline is mute

[Bridge]
Hold this frame, hold this mess, hold this moon
Every good story is frozen too soon

[Chorus]
I am the proudest disaster afloat
A captain of crumbs in a secondhand coat
If the soup does a backflip, I'll take the applause
I cooked us a legend, ignoring the laws

[Outro]
Lights on the water, the kettle goes still
Leave me this picture. I promise I will.
`;

export async function ensureDemoProject(): Promise<MusicVideoProject | null> {
  const existing = await getRepositories().projects.list();
  if (existing.some((p) => p.name === 'Harbor Lights (Demo)')) {
    return existing.find((p) => p.name === 'Harbor Lights (Demo)') ?? null;
  }
  return createDemoProject();
}

export async function createDemoProject(): Promise<MusicVideoProject> {
  const style = getVisualStyle('cartoon-slapstick');
  const timestamp = nowIso();
  const durationSeconds = 32;
  const bible = demoVisualBible('Harbor Lights', style, DEMO_LYRICS);
  const scenes = demoStoryboard(durationSeconds, bible, DEMO_LYRICS, style);
  let project: MusicVideoProject = {
    id: newId(),
    name: 'Harbor Lights (Demo)',
    songTitle: 'Harbor Lights',
    status: 'ready_to_render',
    styleId: style.id,
    durationSeconds,
    lyrics: DEMO_LYRICS,
    visualBible: {
      ...bible,
      characters: bible.characters.map((c) => ({ ...c, lockedReferenceImage: true })),
    },
    visualBibleApproved: true,
    scenes,
    formatId: '16x9',
    captionsEnabled: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  project = await saveProject(project);

  const wav = makeDemoWav(durationSeconds);
  const audio = await storeGeneratedFile({
    projectId: project.id,
    type: 'audio',
    source: 'demo',
    filename: 'harbor-lights.wav',
    body: wav,
    mimeType: 'audio/wav',
    durationSeconds,
  });
  project = await saveProject({
    ...project,
    audio: {
      url: audio.publicUrl,
      filename: 'harbor-lights.wav',
      durationSeconds,
      mimeType: 'audio/wav',
      assetId: audio.id,
    },
  });

  for (const character of project.visualBible?.characters ?? []) {
    const asset = await storeGeneratedFile({
      projectId: project.id,
      type: 'character_reference',
      source: 'demo',
      filename: `${character.id}.svg`,
      body: placeholderSvg({
        title: character.name,
        subtitle: 'Locked reference',
        accent: style.accent,
        secondary: style.secondary,
      }),
      mimeType: 'image/svg+xml',
      width: 1920,
      height: 1080,
    });
    project = await saveProject({
      ...project,
      visualBible: {
        ...project.visualBible!,
        characters: project.visualBible!.characters.map((c) =>
          c.id === character.id ? { ...c, referenceAssetId: asset.id, lockedReferenceImage: true } : c,
        ),
      },
    });
  }

  for (const scene of project.scenes) {
    const asset = await storeGeneratedFile({
      projectId: project.id,
      type: 'scene_image',
      source: 'demo',
      filename: `${scene.id}.svg`,
      body: placeholderSvg({
        title: scene.title,
        subtitle: scene.shotType,
        accent: style.accent,
        secondary: style.secondary,
      }),
      mimeType: 'image/svg+xml',
      width: 1920,
      height: 1080,
    });
    project = await attachAssetToScene(project, scene.id, asset);
  }

  return project;
}
