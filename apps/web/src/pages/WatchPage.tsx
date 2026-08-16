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
    <div className="app-shell watch-shell">
      <div className="sprocket" aria-hidden="true" />
      <div className="app-main">
        <div className="page watch-page">
          <header className="watch-header">
            <div className="brand">
              <small>{PRODUCT_NAME}</small>
              <strong>Shared film</strong>
            </div>
          </header>

          {loading ? <p className="muted">Loading video…</p> : null}

          {error ? (
            <>
              <div className="banner error">{error}</div>
              <Link className="btn" to="/">
                Studio home
              </Link>
            </>
          ) : null}

          {watch ? (
            <>
              <div className="watch-meta">
                <h1>{watch.title}</h1>
                <p className="muted">
                  {watch.songTitle} · {formatClockShort(watch.durationSeconds)}
                </p>
                {watch.mode === 'preview' ? (
                  <p className="faint watch-note">
                    Interactive preview — plays in your browser like the editor cut.
                  </p>
                ) : (
                  <p className="faint watch-note">Final render.</p>
                )}
              </div>

              <div className="watch-player-wrap">
                {watch.mode === 'video' && watch.videoUrl ? (
                  <WatchStage
                    mode="video"
                    videoUrl={watch.videoUrl}
                    durationSeconds={watch.durationSeconds}
                    lyrics={watch.lyrics}
                    onTime={setCurrentSeconds}
                    onFullscreenChange={setFullscreen}
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
                  />
                ) : (
                  <div className="banner warning">This shared film could not be loaded.</div>
                )}
              </div>

              <WatchLyrics lyrics={watch.lyrics} currentSeconds={currentSeconds} hidden={fullscreen} />

              <footer className="watch-footer">
                <button type="button" className="btn" onClick={() => void copyLink()}>
                  {copied ? 'Link copied' : 'Copy link'}
                </button>
                <Link className="watch-footer-link" to="/">
                  Made with {PRODUCT_NAME}
                </Link>
              </footer>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
