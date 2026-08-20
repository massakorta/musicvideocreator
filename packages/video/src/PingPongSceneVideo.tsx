import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AbsoluteFill,
  Img,
  cancelRender,
  continueRender,
  useCurrentFrame,
  useDelayRender,
  useVideoConfig,
} from 'remotion';
import { sceneVideoSourceSeconds } from '@music-video/shared';

function offthreadVideoFrameUrl(src: string, currentTime: number): string {
  const port = typeof window !== 'undefined' ? window.remotion_proxyPort : 3000;
  return `http://localhost:${port}/proxy?src=${encodeURIComponent(src)}&time=${encodeURIComponent(Math.max(0, currentTime))}&transparent=false&toneMapped=true`;
}

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
  const frameUrl = useMemo(() => offthreadVideoFrameUrl(src, sourceTime), [src, sourceTime]);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const { delayRender: delay, continueRender: continueRenderFn } = useDelayRender();

  useLayoutEffect(() => {
    if (!window.remotion_videoEnabled) return;
    setImageSrc(null);
    const controller = new AbortController();
    const handle = delay(`Fetching clip frame at ${sourceTime.toFixed(2)}s`);
    void (async () => {
      try {
        const response = await fetch(frameUrl, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Failed to fetch clip frame (${response.status})`);
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setImageSrc(url);
        continueRenderFn(handle);
      } catch (error) {
        if (controller.signal.aborted) {
          continueRenderFn(handle);
          return;
        }
        cancelRender(error instanceof Error ? error : new Error(String(error)));
      }
    })();
    return () => {
      controller.abort();
    };
  }, [continueRenderFn, delay, frameUrl, sourceTime]);

  if (!imageSrc || !window.remotion_videoEnabled) {
    return <Img src={fallbackImageUrl} style={style} />;
  }

  return <Img src={imageSrc} style={style} />;
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
