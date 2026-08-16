import { useEffect, useRef, useState } from 'react';
import { formatClock } from '../lib/time';

export function AudioPlayer({ src, duration }: { src?: string; duration: number }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onTime = () => setCurrent(el.currentTime);
    const onEnded = () => setPlaying(false);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('ended', onEnded);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('ended', onEnded);
    };
  }, [src]);

  if (!src) return <div className="banner">Upload a song to hear it against the storyboard.</div>;

  return (
    <div className="card audio-bar">
      <audio ref={ref} src={src} />
      <button
        className="btn"
        onClick={() => {
          const el = ref.current;
          if (!el) return;
          if (el.paused) {
            void el.play();
            setPlaying(true);
          } else {
            el.pause();
            setPlaying(false);
          }
        }}
      >
        {playing ? 'Pause' : 'Play'}
      </button>
      <input
        type="range"
        min={0}
        max={duration || 1}
        step={0.05}
        value={current}
        onChange={(e) => {
          const value = Number(e.target.value);
          if (ref.current) ref.current.currentTime = value;
          setCurrent(value);
        }}
        style={{ flex: 1 }}
      />
      <span className="mono">
        {formatClock(current)} / {formatClock(duration)}
      </span>
    </div>
  );
}
