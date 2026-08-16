import React from 'react';
import { Composition } from 'remotion';
import { getVideoPreset, secondsToFrames } from '@music-video/shared';
import { MusicVideoComposition } from './MusicVideoComposition.js';
import type { MusicVideoCompositionProps } from './compositionTypes.js';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="MusicVideo"
      component={MusicVideoComposition as React.FC}
      durationInFrames={900}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{
        project: {
          durationSeconds: 30,
          formatId: '16x9',
          scenes: [],
        },
      }}
      calculateMetadata={({ props }) => {
        const typed = props as unknown as MusicVideoCompositionProps;
        const preset = getVideoPreset(typed.project.formatId);
        return {
          durationInFrames: Math.max(1, secondsToFrames(typed.project.durationSeconds, preset.fps)),
          fps: preset.fps,
          width: preset.width,
          height: preset.height,
        };
      }}
    />
  );
};
