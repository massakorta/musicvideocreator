import { describe, expect, it } from 'vitest';
import type { MusicVideoProject, StoryboardScene } from '@music-video/shared';
import { projectToComposition } from './compositionTypes.js';

function scene(partial: Partial<StoryboardScene>): StoryboardScene {
  return {
    id: 'a',
    order: 1,
    startTime: 0,
    endTime: 5,
    duration: 5,
    songSection: 'verse',
    title: 'Scene',
    description: 'desc',
    action: 'hold',
    characters: [],
    shotType: 'medium',
    cameraIntent: 'hold',
    imagePrompt: 'prompt',
    suggestedMotion: 'slowZoomIn',
    motion: 'slowZoomIn',
    transitionIn: 'cut',
    transitionOut: 'cut',
    mediaType: 'image',
    previousAssetIds: [],
    previousVideoAssetIds: [],
    generationState: 'complete',
    videoGenerationState: 'pending',
    approved: false,
    ...partial,
  };
}

describe('projectToComposition', () => {
  it('prefers videoUrl when a clip exists', () => {
    const project: MusicVideoProject = {
      id: 'p1',
      name: 'Test',
      songTitle: 'Test',
      status: 'editing',
      durationSeconds: 10,
      lyrics: '',
      visualBibleApproved: true,
      formatId: '16x9',
      captionsEnabled: false,
      createdAt: '',
      updatedAt: '',
      scenes: [
        scene({
          image: {
            id: 'img',
            projectId: 'p1',
            type: 'scene_image',
            source: 'ai',
            storagePath: 'img.jpg',
            publicUrl: 'https://example.com/still.jpg',
            mimeType: 'image/jpeg',
            createdAt: '',
          },
          video: {
            id: 'vid',
            projectId: 'p1',
            type: 'scene_video',
            source: 'ai',
            storagePath: 'clip.mp4',
            publicUrl: 'https://example.com/clip.mp4',
            mimeType: 'video/mp4',
            durationSeconds: 5,
            createdAt: '',
          },
          currentAssetId: 'img',
          currentVideoAssetId: 'vid',
          mediaType: 'video',
          videoGenerationState: 'complete',
        }),
      ],
    };

    const composition = projectToComposition(project);
    expect(composition.scenes[0]?.videoUrl).toBe('https://example.com/clip.mp4');
    expect(composition.scenes[0]?.playbackRate).toBe(1);
  });
});
