import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiClientError } from '../lib/api';

export function NewProjectPage() {
  const [name, setName] = useState('');
  const [songTitle, setSongTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { project } = await api.createProject({ name, songTitle: songTitle || name });
      navigate(`/projects/${project.id}/setup`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not create the project.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 640 }}>
      <Link to="/" className="faint">
        ← Projects
      </Link>
      <h1 style={{ fontSize: 40, margin: '12px 0' }}>New music video</h1>
      <p className="hero-copy">Name the film. You’ll upload the song and lyrics next.</p>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="name">Project name</label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jens – Havets sämsta kock"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="song">Song title</label>
          <input
            id="song"
            value={songTitle}
            onChange={(e) => setSongTitle(e.target.value)}
            placeholder="Same as the project, or the track title"
          />
        </div>
        {error ? <div className="banner error">{error}</div> : null}
        <button className="btn btn-primary" disabled={busy || !name.trim()}>
          {busy ? 'Creating…' : 'Continue'}
        </button>
      </form>
    </div>
  );
}
