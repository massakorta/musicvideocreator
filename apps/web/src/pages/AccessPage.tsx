import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { PRODUCT_NAME, PRODUCT_TAGLINE } from '@music-video/shared';
import { api, ApiClientError } from '../lib/api';
import { useSession } from '../hooks/useProject';

export function AccessPage({ onAuthed }: { onAuthed: () => void }) {
  const session = useSession();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || '/';

  if (!session.accessRequired || session.authenticated) {
    return <Navigate to="/" replace />;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.access(code);
      onAuthed();
      navigate(from.startsWith('/') ? from : '/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not verify that code.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 520, margin: '12vh auto' }}>
      <div className="brand">
        <small>Beta access</small>
        <strong>{PRODUCT_NAME}</strong>
      </div>
      <p className="hero-copy">{PRODUCT_TAGLINE}</p>
      <form className="card" style={{ padding: 22 }} onSubmit={submit}>
        <div className="field">
          <label htmlFor="code">Access code</label>
          <input
            id="code"
            type="password"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Enter the beta code"
            autoComplete="current-password"
          />
        </div>
        {error ? <div className="banner error">{error}</div> : null}
        <button className="btn btn-primary" type="submit" disabled={busy || !code.trim()}>
          {busy ? 'Checking…' : 'Enter studio'}
        </button>
      </form>
    </div>
  );
}
