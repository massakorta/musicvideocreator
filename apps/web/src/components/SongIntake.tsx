import { useState } from 'react';
import { WaitCard } from './WaitCard';

export interface SongIntakeLoaded {
  label: string;
  detail?: string;
}

export interface SongIntakeProps {
  loaded?: SongIntakeLoaded;
  busy?: boolean;
  waitTitle?: string;
  waitStages?: string[];
  onFileSelect: (file: File) => void | Promise<void>;
  /** Immediate import (Setup). Omit on New project — use deferred Suno fields instead. */
  onSunoImport?: (url: string) => void | Promise<void>;
  sunoUrl?: string;
  onSunoUrlChange?: (url: string) => void;
  sunoSelected?: boolean;
  onSunoSelect?: () => void;
}

export function SongIntake({
  loaded,
  busy = false,
  waitTitle = 'Working on the song',
  waitStages = ['Reading the link…', 'Downloading from Suno…', 'Saving the master track…'],
  onFileSelect,
  onSunoImport,
  sunoUrl = '',
  onSunoUrlChange,
  sunoSelected = false,
  onSunoSelect,
}: SongIntakeProps) {
  const [dragOver, setDragOver] = useState(false);
  const fileReady = Boolean(loaded && !sunoSelected);
  const sunoReady = sunoSelected && Boolean(sunoUrl.trim());

  return (
    <>
      <div className="intake-desk">
        <div
          className={`intake-well ${dragOver ? 'dragover' : ''} ${fileReady ? 'ready' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const next = e.dataTransfer.files[0];
            if (next) void onFileSelect(next);
          }}
        >
          <div className={`intake-disc ${fileReady ? 'ready' : ''}`} aria-hidden="true" />
          <div>
            <strong>{fileReady ? 'Master loaded' : 'Upload a file'}</strong>
            <p className="muted">
              {fileReady
                ? loaded?.detail ?? loaded?.label
                : 'Drop an MP3, WAV, or M4A. This track is the clock for the cut.'}
            </p>
          </div>
          <label className="btn">
            {fileReady ? 'Replace song' : 'Choose audio file'}
            <input
              hidden
              type="file"
              accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4"
              onChange={(e) => {
                const next = e.target.files?.[0];
                e.target.value = '';
                if (next) void onFileSelect(next);
              }}
            />
          </label>
        </div>

        <div className={`intake-well intake-suno ${sunoReady ? 'ready' : ''}`}>
          <div className="intake-suno-mark" aria-hidden="true">
            S
          </div>
          <div>
            <strong>{sunoReady ? 'Suno link ready' : 'Import from Suno'}</strong>
            <p className="muted">
              {sunoReady
                ? sunoUrl.trim()
                : 'Paste a public Suno share link (suno.com/s/… or suno.com/song/…).'}
            </p>
          </div>
          <div className="intake-suno-form">
            <input
              type="url"
              className="intake-suno-input"
              placeholder="https://suno.com/s/…"
              value={sunoUrl}
              disabled={busy}
              onChange={(e) => onSunoUrlChange?.(e.target.value)}
            />
            {onSunoImport ? (
              <button
                type="button"
                className="btn"
                disabled={busy || !sunoUrl.trim()}
                onClick={() => void onSunoImport(sunoUrl.trim())}
              >
                Fetch song
              </button>
            ) : (
              <button
                type="button"
                className="btn"
                disabled={busy || !sunoUrl.trim()}
                onClick={() => onSunoSelect?.()}
              >
                Use Suno link
              </button>
            )}
          </div>
        </div>
      </div>

      {busy ? <WaitCard title={waitTitle} expectedSeconds={18} stages={waitStages} /> : null}
    </>
  );
}
