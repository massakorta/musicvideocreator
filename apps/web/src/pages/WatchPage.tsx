import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PRODUCT_NAME } from '@music-video/shared';
import { api, ApiClientError } from '../lib/api';
import { formatClockShort } from '../lib/time';

export function WatchPage() {
  const { shareId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [watch, setWatch] = useState<{
    title: string;
    songTitle: string;
    durationSeconds: number;
    videoUrl: string;
  } | null>(null);

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

  return (
    <div className="app-shell">
      <div className="sprocket" aria-hidden="true" />
      <div className="app-main">
        <div className="page" style={{ maxWidth: 960, margin: '0 auto' }}>
          <header style={{ marginBottom: 24 }}>
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
              <h1>{watch.title}</h1>
              <p className="muted">
                {watch.songTitle} · {formatClockShort(watch.durationSeconds)}
              </p>
              <video
                src={watch.videoUrl}
                controls
                playsInline
                style={{ width: '100%', borderRadius: 16, marginTop: 16, background: '#000' }}
              />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
