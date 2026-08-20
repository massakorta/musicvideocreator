import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PRODUCT_NAME } from '@music-video/shared';
import type { CompositionProject } from '@music-video/video';
import { api, ApiClientError } from '../lib/api';
import { formatClockShort } from '../lib/time';
import { WatchStage } from '../components/WatchStage';
import { WatchLyrics } from '../components/WatchLyrics';
import type { PublicWatchLyrics } from '../components/watch/types';

type PublicWatch = {
  title: string;
  songTitle: string;
  durationSeconds: number;
  shareId: string;
  mode: 'preview' | 'video';
  videoUrl?: string;
  preview?: {
    composition: CompositionProject;
    durationInFrames: number;
    fps: number;
    width: number;
    height: number;
    audioUrl?: string;
  };
  lyrics?: PublicWatchLyrics;
};

export function WatchPage() {
  const { shareId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [watch, setWatch] = useState<PublicWatch | null>(null);
  const [currentSeconds, setCurrentSeconds] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!shareId) {
      setError('Missing share link.');
      setLoading(false);
      return;
    }
    void api
      .publicWatch(shareId)
      .then((data) => {
        setWatch(data.watch);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof ApiClientError ? err.message : 'Could not load this video.');
      })
      .finally(() => setLoading(false));
  }, [shareId]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={`watch-page watch-page--standalone${fullscreen ? ' watch-page--theater' : ''}`}>
      <header className="watch-header">
        <div className="brand">
          <small>{PRODUCT_NAME}</small>
          <strong>Shared film</strong>
        </div>
      </header>

      {loading ? <p className="muted" style={{ paddingInline: 'var(--page-x)' }}>Loading video…</p> : null}

      {error ? (
        <div style={{ paddingInline: 'var(--page-x)' }}>
          <div className="banner error">{error}</div>
          <Link className="btn" to="/">
            Studio home
          </Link>
        </div>
      ) : null}

      {watch ? (
        <>
          <div className="watch-meta">
            <h1>{watch.title}</h1>
            <p className="muted">
              {watch.songTitle} · {formatClockShort(watch.durationSeconds)}
            </p>
            <p className="faint watch-note">
              {watch.mode === 'video'
                ? 'Finished MP4 — plays natively in your browser.'
                : 'Live preview cut — generate an MP4 in the editor for smoother mobile playback.'}
            </p>
          </div>

          <div className="watch-player-wrap watch-player-wrap--bleed">
            {watch.mode === 'video' && watch.videoUrl ? (
              <WatchStage
                mode="video"
                videoUrl={watch.videoUrl}
                durationSeconds={watch.durationSeconds}
                lyrics={watch.lyrics}
                onTime={setCurrentSeconds}
                onFullscreenChange={setFullscreen}
                overlayControls
              />
            ) : watch.preview ? (
              <WatchStage
                mode="preview"
                composition={watch.preview.composition}
                durationInFrames={watch.preview.durationInFrames}
                fps={watch.preview.fps}
                width={watch.preview.width}
                height={watch.preview.height}
                audioUrl={watch.preview.audioUrl}
                durationSeconds={watch.durationSeconds}
                lyrics={watch.lyrics}
                onTime={setCurrentSeconds}
                onFullscreenChange={setFullscreen}
                overlayControls
              />
            ) : (
              <div className="banner warning" style={{ marginInline: 'var(--page-x)' }}>
                This shared film could not be loaded.
              </div>
            )}
          </div>

          <WatchLyrics lyrics={watch.lyrics} currentSeconds={currentSeconds} hidden={fullscreen} />

          <footer className="watch-footer">
            <button type="button" className="btn btn-primary" onClick={() => void copyLink()}>
              {copied ? 'Link copied' : 'Copy link'}
            </button>
            <Link className="watch-footer-link" to="/">
              Made with {PRODUCT_NAME}
            </Link>
          </footer>
        </>
      ) : null}
    </div>
  );
}
