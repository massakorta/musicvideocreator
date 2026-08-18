import { formatClockShort } from '../../lib/time';

export function WatchControls({
  playing,
  currentSeconds,
  durationSeconds,
  fullscreen,
  overlay,
  onTogglePlay,
  onSeek,
  onToggleFullscreen,
}: {
  playing: boolean;
  currentSeconds: number;
  durationSeconds: number;
  fullscreen: boolean;
  overlay?: boolean;
  onTogglePlay: () => void;
  onSeek: (seconds: number) => void;
  onToggleFullscreen: () => void;
}) {
  const max = Math.max(durationSeconds, 0.1);

  return (
    <div
      className={`watch-controls${overlay ? ' watch-controls--overlay' : ''}`}
      role="group"
      aria-label="Video controls"
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="watch-control-btn"
        onClick={onTogglePlay}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? 'Pause' : 'Play'}
      </button>
      <input
        className="watch-seek"
        type="range"
        min={0}
        max={max}
        step={0.05}
        value={Math.min(currentSeconds, max)}
        aria-label="Seek"
        onChange={(event) => onSeek(Number(event.target.value))}
      />
      <span className="watch-time mono">
        {formatClockShort(currentSeconds)} / {formatClockShort(durationSeconds)}
      </span>
      <button
        type="button"
        className="watch-control-btn"
        onClick={onToggleFullscreen}
        aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
      >
        {fullscreen ? 'Exit' : 'Fullscreen'}
      </button>
    </div>
  );
}
