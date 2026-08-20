import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type FC } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { MusicVideoComposition, type CompositionProject } from '@music-video/video';

export interface SyncedPreviewHandle {
  seekToSeconds: (seconds: number) => void;
}

export const SyncedPreview = forwardRef<
  SyncedPreviewHandle,
  {
    composition: CompositionProject;
    durationInFrames: number;
    fps: number;
    width: number;
    height: number;
    audioUrl?: string;
    onFrame: (frame: number) => void;
  }
>(function SyncedPreview({ composition, durationInFrames, fps, width, height, audioUrl, onFrame }, ref) {
  const preview = useRef<HTMLDivElement>(null);
  const player = useRef<PlayerRef>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [playbackActive, setPlaybackActive] = useState(false);

  useImperativeHandle(ref, () => ({
    seekToSeconds(seconds: number) {
      const clamped = Math.max(0, seconds);
      if (audio.current) audio.current.currentTime = clamped;
      player.current?.seekTo(Math.round(clamped * fps));
      onFrame(Math.round(clamped * fps));
    },
  }));

  useEffect(() => {
    for (const scene of composition.scenes) {
      const image = new Image();
      image.src = scene.imageUrl;
    }
  }, [composition.scenes]);

  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setPlaybackActive(false);
      player.current?.seekTo(0);
      onFrame(0);
    };
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
    };
  }, [audioUrl, onFrame]);

  useEffect(() => {
    if (!audioUrl) {
      const instance = player.current;
      if (!instance) return;
      const onUpdate = ({ detail }: { detail: { frame: number } }) => onFrame(detail.frame);
      instance.addEventListener('frameupdate', onUpdate);
      return () => instance.removeEventListener('frameupdate', onUpdate);
    }

    let raf = 0;
    const tick = () => {
      const el = audio.current;
      if (el && !el.paused) {
        const frame = Math.round(el.currentTime * fps);
        const instance = player.current;
        if (instance && Math.abs(instance.getCurrentFrame() - frame) > 0) {
          instance.seekTo(frame);
        }
        onFrame(frame);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [audioUrl, fps, onFrame]);

  function unlockSceneVideos() {
    preview.current?.querySelectorAll('video').forEach((video) => {
      video.muted = true;
      void video.play().catch(() => {});
    });
  }

  function togglePlay() {
    if (playing) {
      setPlaybackActive(false);
      if (audioUrl && audio.current) {
        audio.current.pause();
      } else {
        player.current?.pause();
      }
      return;
    }

    setPlaybackActive(true);
    unlockSceneVideos();
    if (audioUrl && audio.current) {
      void audio.current.play().catch(() => setPlaybackActive(false));
      return;
    }
    player.current?.play();
  }

  return (
    <div ref={preview} className="preview-stage" style={{ position: 'relative' }}>
      {audioUrl ? <audio ref={audio} src={audioUrl} preload="auto" playsInline /> : null}
      <Player
        ref={player}
        component={MusicVideoComposition as FC}
        inputProps={{ project: composition, includeAudio: false, playbackActive }}
        durationInFrames={durationInFrames}
        fps={fps}
        compositionWidth={width}
        compositionHeight={height}
        style={{ width: '100%', height: '100%' }}
        controls={!audioUrl}
        autoPlay={false}
        clickToPlay={!audioUrl}
        doubleClickToFullscreen
        acknowledgeRemotionLicense
      />
      {audioUrl ? (
        <button
          type="button"
          className="btn btn-primary preview-play"
          onClick={togglePlay}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
      ) : null}
    </div>
  );
});
