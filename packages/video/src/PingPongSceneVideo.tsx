import React, { useLayoutEffect, useRef, useState } from 'react';
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { sceneVideoSourceSeconds } from '@music-video/shared';

function seekVideo(video: HTMLVideoElement, sourceTime: number) {
  if (Math.abs(video.currentTime - sourceTime) <= 0.08) return;
  try {
    if ('fastSeek' in video && typeof video.fastSeek === 'function') {
      video.fastSeek(sourceTime);
    } else {
      video.currentTime = sourceTime;
    }
  } catch {
    // ignore seek errors while metadata is loading
  }
}

function PingPongSceneVideoPreview({
  src,
  sourceTime,
  fallbackImageUrl,
  playbackActive,
  style,
}: {
  src: string;
  sourceTime: number;
  fallbackImageUrl: string;
  playbackActive: boolean;
  style?: React.CSSProperties;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);

  useLayoutEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!playbackActive) {
      video.pause();
      return;
    }

    void (async () => {
      try {
        if (video.paused) {
          await video.play();
        }
      } catch {
        // Mobile Safari requires a user gesture before play(); the parent toggles playbackActive after Play is tapped.
      }
      seekVideo(video, sourceTime);
    })();
  }, [playbackActive, sourceTime]);

  const fillStyle: React.CSSProperties = {
    ...style,
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  };

  return (
    <AbsoluteFill>
      <Img src={fallbackImageUrl} style={fillStyle} />
      <video
        ref={videoRef}
        src={src}
        muted
        playsInline
        preload="auto"
        onLoadedData={() => setVideoReady(true)}
        onCanPlay={() => setVideoReady(true)}
        style={{ ...fillStyle, opacity: videoReady ? 1 : 0 }}
      />
    </AbsoluteFill>
  );
}

function PingPongSceneVideoRender({
  src,
  sourceTime,
  fallbackImageUrl,
  style,
}: {
  src: string;
  sourceTime: number;
  fallbackImageUrl: string;
  style?: React.CSSProperties;
}) {
  const { fps } = useVideoConfig();
  const frameInClip = Math.max(0, Math.round(sourceTime * fps));
  const fillStyle: React.CSSProperties = {
    ...style,
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  };

  return (
    <AbsoluteFill>
      <Img src={fallbackImageUrl} style={fillStyle} />
      <OffthreadVideo
        src={src}
        muted
        trimBefore={frameInClip}
        trimAfter={frameInClip + 1}
        style={{ ...fillStyle, zIndex: 1 }}
      />
    </AbsoluteFill>
  );
}

export function PingPongSceneVideo({
  src,
  clipDurationSeconds,
  sceneDurationSeconds,
  fallbackImageUrl,
  playbackActive = false,
  style,
}: {
  src: string;
  clipDurationSeconds: number;
  sceneDurationSeconds: number;
  fallbackImageUrl: string;
  playbackActive?: boolean;
  style?: React.CSSProperties;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sourceTime = sceneVideoSourceSeconds(frame / fps, clipDurationSeconds, sceneDurationSeconds);
  const isRendering = typeof window !== 'undefined' && window.remotion_videoEnabled;

  if (isRendering) {
    return (
      <PingPongSceneVideoRender
        src={src}
        sourceTime={sourceTime}
        fallbackImageUrl={fallbackImageUrl}
        style={style}
      />
    );
  }

  return (
    <PingPongSceneVideoPreview
      src={src}
      sourceTime={sourceTime}
      fallbackImageUrl={fallbackImageUrl}
      playbackActive={playbackActive}
      style={style}
    />
  );
}
