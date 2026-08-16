import { useEffect, useRef, useState, type FC } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { MusicVideoComposition, type CompositionProject } from '@music-video/video';

export function WatchPlayer({
  composition,
  durationInFrames,
  fps,
  width,
  height,
  audioUrl,
}: {
  composition: CompositionProject;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  audioUrl?: string;
}) {
  const player = useRef<PlayerRef>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

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
      player.current?.seekTo(0);
    };
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
    };
  }, [audioUrl]);

  useEffect(() => {
    if (!audioUrl) return;
    let raf = 0;
    const tick = () => {
      const el = audio.current;
      if (el && !el.paused) {
        const frame = Math.round(el.currentTime * fps);
        const instance = player.current;
        if (instance && Math.abs(instance.getCurrentFrame() - frame) > 0) {
          instance.seekTo(frame);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [audioUrl, fps]);

  function togglePlay() {
    if (audioUrl && audio.current) {
      if (audio.current.paused) {
        void audio.current.play();
      } else {
        audio.current.pause();
      }
      return;
    }
    const instance = player.current;
    if (!instance) return;
    if (instance.isPlaying()) instance.pause();
    else instance.play();
  }

  return (
    <div className="preview-stage watch-player" style={{ position: 'relative' }}>
      {audioUrl ? <audio ref={audio} src={audioUrl} preload="auto" playsInline crossOrigin="anonymous" /> : null}
      <Player
        ref={player}
        component={MusicVideoComposition as FC}
        inputProps={{ project: composition, includeAudio: false }}
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
}
