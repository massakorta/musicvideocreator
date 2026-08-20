import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { MusicVideoComposition, type CompositionProject } from '@music-video/video';
import { WatchControls } from './watch/WatchControls';
import { useMobileFullscreenControls } from './watch/useMobileFullscreenControls';
import { useWatchFullscreen } from './watch/useWatchFullscreen';
import { currentLyricLine, type PublicWatchLyrics } from './watch/types';

type PreviewProps = {
  mode: 'preview';
  composition: CompositionProject;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  audioUrl?: string;
};

type VideoProps = {
  mode: 'video';
  videoUrl: string;
};

type WatchStageProps = (PreviewProps | VideoProps) & {
  durationSeconds: number;
  lyrics?: PublicWatchLyrics;
  onTime?: (seconds: number) => void;
  onFullscreenChange?: (fullscreen: boolean) => void;
  overlayControls?: boolean;
};

export function WatchStage(props: WatchStageProps) {
  const { durationSeconds, lyrics, onTime, onFullscreenChange, overlayControls = false } = props;
  const stageRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<PlayerRef>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [playbackActive, setPlaybackActive] = useState(false);
  const [currentSeconds, setCurrentSeconds] = useState(0);
  const currentSecondsRef = useRef(0);
  const { fullscreen, immersive, toggleFullscreen } = useWatchFullscreen(stageRef);
  const { mobileFullscreen, controlsVisible, showControls, scheduleHideControls } =
    useMobileFullscreenControls(fullscreen, playing);

  const setTime = useCallback(
    (seconds: number) => {
      const clamped = Math.max(0, Math.min(seconds, durationSeconds || seconds));
      currentSecondsRef.current = clamped;
      setCurrentSeconds(clamped);
      onTime?.(clamped);
    },
    [durationSeconds, onTime],
  );

  const seekTo = useCallback(
    (seconds: number) => {
      const clamped = Math.max(0, Math.min(seconds, durationSeconds || seconds));
      if (props.mode === 'video') {
        const video = videoRef.current;
        if (video) video.currentTime = clamped;
      } else if (props.audioUrl && audioRef.current) {
        audioRef.current.currentTime = clamped;
        playerRef.current?.seekTo(Math.round(clamped * props.fps));
      } else {
        playerRef.current?.seekTo(Math.round(clamped * props.fps));
      }
      setTime(clamped);
    },
    [durationSeconds, props, setTime],
  );

  const unlockSceneVideos = useCallback(() => {
    stageRef.current?.querySelectorAll('video').forEach((video) => {
      video.muted = true;
      void video.play().catch(() => {});
    });
  }, []);

  const pause = useCallback(() => {
    setPlaybackActive(false);
    if (props.mode === 'video') {
      videoRef.current?.pause();
      return;
    }

    if (props.audioUrl && audioRef.current) {
      audioRef.current.pause();
      return;
    }

    playerRef.current?.pause();
  }, [props]);

  const play = useCallback(async () => {
    setPlaybackActive(true);
    unlockSceneVideos();
    if (props.mode === 'video') {
      const video = videoRef.current;
      if (video) {
        try {
          await video.play();
        } catch {
          setPlaybackActive(false);
        }
      }
      return;
    }

    if (props.audioUrl && audioRef.current) {
      try {
        await audioRef.current.play();
      } catch {
        setPlaybackActive(false);
      }
      return;
    }

    playerRef.current?.play();
  }, [props, unlockSceneVideos]);

  const togglePlay = useCallback(() => {
    if (playing) {
      pause();
    } else {
      void play();
    }
  }, [pause, play, playing]);

  const handleFrameClick = useCallback(() => {
    if (mobileFullscreen) {
      if (playing) {
        pause();
        showControls();
      }
      return;
    }

    togglePlay();
  }, [mobileFullscreen, pause, playing, showControls, togglePlay]);

  useEffect(() => {
    onFullscreenChange?.(fullscreen);
  }, [fullscreen, onFullscreenChange]);

  useEffect(() => {
    if (props.mode !== 'preview') return;
    for (const scene of props.composition.scenes) {
      const image = new Image();
      image.src = scene.imageUrl;
      if (scene.videoUrl) {
        const video = document.createElement('video');
        video.preload = 'auto';
        video.muted = true;
        video.playsInline = true;
        video.src = scene.videoUrl;
        video.load();
      }
    }
  }, [props.mode, props.mode === 'preview' ? props.composition.scenes : null]);

  useEffect(() => {
    if (props.mode === 'video') {
      const video = videoRef.current;
      if (!video) return;
      const onPlay = () => setPlaying(true);
      const onPause = () => setPlaying(false);
      const onTimeUpdate = () => setTime(video.currentTime);
      const onEnded = () => {
        setPlaying(false);
        setPlaybackActive(false);
        setTime(0);
      };
      video.addEventListener('play', onPlay);
      video.addEventListener('pause', onPause);
      video.addEventListener('timeupdate', onTimeUpdate);
      video.addEventListener('ended', onEnded);
      return () => {
        video.removeEventListener('play', onPlay);
        video.removeEventListener('pause', onPause);
        video.removeEventListener('timeupdate', onTimeUpdate);
        video.removeEventListener('ended', onEnded);
      };
    }

    const audio = audioRef.current;
    if (audio) {
      const onPlay = () => setPlaying(true);
      const onPause = () => setPlaying(false);
      const onTimeUpdate = () => setTime(audio.currentTime);
      const onEnded = () => {
        setPlaying(false);
        setPlaybackActive(false);
        playerRef.current?.seekTo(0);
        setTime(0);
      };
      audio.addEventListener('play', onPlay);
      audio.addEventListener('pause', onPause);
      audio.addEventListener('timeupdate', onTimeUpdate);
      audio.addEventListener('ended', onEnded);
      return () => {
        audio.removeEventListener('play', onPlay);
        audio.removeEventListener('pause', onPause);
        audio.removeEventListener('timeupdate', onTimeUpdate);
        audio.removeEventListener('ended', onEnded);
      };
    }

    const instance = playerRef.current;
    if (!instance) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    instance.addEventListener('play', onPlay);
    instance.addEventListener('pause', onPause);
    return () => {
      instance.removeEventListener('play', onPlay);
      instance.removeEventListener('pause', onPause);
    };
  }, [props.mode, props.mode === 'preview' ? props.audioUrl : null, setTime]);

  useEffect(() => {
    if (props.mode !== 'preview') return;

    if (props.audioUrl) {
      let raf = 0;
      const tick = () => {
        const audio = audioRef.current;
        if (audio && !audio.paused) {
          const frame = Math.round(audio.currentTime * props.fps);
          const instance = playerRef.current;
          if (instance && Math.abs(instance.getCurrentFrame() - frame) > 0) {
            instance.seekTo(frame);
          }
          setTime(audio.currentTime);
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }

    const instance = playerRef.current;
    if (!instance) return;
    const onUpdate = ({ detail }: { detail: { frame: number } }) => {
      setTime(detail.frame / props.fps);
    };
    instance.addEventListener('frameupdate', onUpdate);
    return () => instance.removeEventListener('frameupdate', onUpdate);
  }, [props.mode, props.mode === 'preview' ? props.audioUrl : null, props.mode === 'preview' ? props.fps : null, setTime]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }

      if (event.code === 'Space') {
        event.preventDefault();
        togglePlay();
      } else if (event.key === 'f' || event.key === 'F') {
        event.preventDefault();
        void toggleFullscreen();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        seekTo(currentSecondsRef.current - 5);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        seekTo(currentSecondsRef.current + 5);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [seekTo, toggleFullscreen, togglePlay]);

  const caption =
    fullscreen && lyrics?.lines.length
      ? currentLyricLine(lyrics.lines, currentSeconds)
      : null;

  return (
    <div
      ref={stageRef}
      className={`watch-stage${immersive ? ' watch-stage--immersive' : ''}${fullscreen ? ' watch-stage--fullscreen' : ''}`}
    >
      <div
        className="watch-frame"
        onClick={handleFrameClick}
        onDoubleClick={() => {
          void toggleFullscreen();
        }}
        role="presentation"
      >
        {props.mode === 'video' ? (
          <video
            ref={videoRef}
            className="watch-video"
            src={props.videoUrl}
            playsInline
            preload="metadata"
          />
        ) : (
          <>
            {props.audioUrl ? (
              <audio
                ref={audioRef}
                src={props.audioUrl}
                preload="auto"
                playsInline
                crossOrigin="anonymous"
              />
            ) : null}
            <Player
              ref={playerRef}
              component={MusicVideoComposition as FC}
              inputProps={{ project: props.composition, includeAudio: false, playbackActive }}
              durationInFrames={props.durationInFrames}
              fps={props.fps}
              compositionWidth={props.width}
              compositionHeight={props.height}
              style={{ width: '100%', height: '100%' }}
              controls={false}
              autoPlay={false}
              clickToPlay={false}
              doubleClickToFullscreen={false}
              acknowledgeRemotionLicense
            />
          </>
        )}
        {caption ? <div className="watch-caption">{caption}</div> : null}
        {overlayControls ? (
          <WatchControls
            playing={playing}
            currentSeconds={currentSeconds}
            durationSeconds={durationSeconds}
            fullscreen={fullscreen}
            hidden={mobileFullscreen && !controlsVisible}
            overlay
            onTogglePlay={() => {
              void togglePlay();
              showControls();
            }}
            onSeek={(seconds) => {
              seekTo(seconds);
              showControls();
              if (playing) {
                scheduleHideControls();
              }
            }}
            onToggleFullscreen={() => {
              void toggleFullscreen();
              showControls();
            }}
          />
        ) : null}
      </div>
      {!overlayControls ? (
        <WatchControls
          playing={playing}
          currentSeconds={currentSeconds}
          durationSeconds={durationSeconds}
          fullscreen={fullscreen}
          onTogglePlay={togglePlay}
          onSeek={seekTo}
          onToggleFullscreen={() => {
            void toggleFullscreen();
          }}
        />
      ) : null}
    </div>
  );
}
