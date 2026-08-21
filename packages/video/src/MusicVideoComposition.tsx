import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { secondsToFrames } from '@music-video/shared';
import type { CompositionScene, MusicVideoCompositionProps } from './compositionTypes.js';
import { TRANSITION_FRAMES } from './compositionTypes.js';
import { motionStyle } from './motionStyle.js';
import { PingPongSceneVideo } from './PingPongSceneVideo.js';
import { transitionStyleForFrame } from './transitions.js';

export const MusicVideoComposition: React.FC<MusicVideoCompositionProps> = ({
  project,
  includeAudio = false,
  playbackActive = false,
}) => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: '#090807' }}>
      {project.scenes.map((scene, index) => {
        const next = project.scenes[index + 1];
        const overlap = next
          ? Math.min(
              TRANSITION_FRAMES[scene.transitionOut],
              TRANSITION_FRAMES[next.transitionIn],
            )
          : 0;
        const from = secondsToFrames(scene.startTime, fps);
        const duration = Math.max(1, secondsToFrames(scene.endTime - scene.startTime, fps) + overlap);
        return (
          <Sequence key={scene.id} from={from} durationInFrames={duration} layout="none" name={scene.id}>
            <SceneLayer scene={scene} durationInFrames={duration} playbackActive={playbackActive} />
          </Sequence>
        );
      })}
      {includeAudio && project.audioUrl ? <Audio src={project.audioUrl} /> : null}
    </AbsoluteFill>
  );
};

const SceneLayer: React.FC<{
  scene: CompositionScene;
  durationInFrames: number;
  playbackActive: boolean;
}> = ({ scene, durationInFrames, playbackActive }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const motion = motionStyle(scene.motion, frame, durationInFrames, scene.id);
  const transition = transitionStyleForFrame({
    frame,
    durationFrames: durationInFrames,
    transitionIn: scene.transitionIn,
    transitionOut: scene.transitionOut,
  });

  const mediaStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  };
  const sceneDurationSeconds = durationInFrames / fps;

  return (
    <AbsoluteFill style={{ overflow: 'hidden', opacity: transition.opacity, transform: transition.transform }}>
      {scene.videoUrl && scene.videoDurationSeconds ? (
        <PingPongSceneVideo
          src={scene.videoUrl}
          clipDurationSeconds={scene.videoDurationSeconds ?? sceneDurationSeconds}
          sceneDurationSeconds={sceneDurationSeconds}
          fallbackImageUrl={scene.imageUrl}
          playbackActive={playbackActive}
          videoFramePrefix={scene.videoFramePrefix}
          videoFrameCount={scene.videoFrameCount}
          style={mediaStyle}
        />
      ) : (
        <Img src={scene.imageUrl} style={motion} />
      )}
      {transition.overlayOpacity > 0 ? (
        <AbsoluteFill
          style={{
            backgroundColor: transition.overlayColor,
            opacity: transition.overlayOpacity,
            pointerEvents: 'none',
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};
