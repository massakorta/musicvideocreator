import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { VISUAL_STYLE_PRESETS } from '@music-video/shared';
import { useProject } from '../hooks/useProject';
import { api, ApiClientError } from '../lib/api';

export function StylePage() {
  const { project, setProject } = useProject();
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(styleId: string) {
    setBusyId(styleId);
    setError(null);
    try {
      const data = await api.patchProject(project.id, { styleId });
      setProject(data.project, data.health);
      navigate(`/projects/${project.id}/bible`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not save that style.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page">
      <p className="hero-copy">Pick the look. Every later still — bible, characters, and scenes — stays inside this world.</p>
      {error ? <div className="banner error">{error}</div> : null}
      <div className="style-grid">
        {VISUAL_STYLE_PRESETS.map((style) => (
          <button
            key={style.id}
            className={`card style-card ${project.styleId === style.id ? 'selected' : ''}`}
            disabled={Boolean(busyId)}
            onClick={() => void choose(style.id)}
          >
            <div
              className="style-swatch"
              style={{
                background: `linear-gradient(135deg, ${style.accent}, ${style.secondary} 55%, #14110e)`,
              }}
            />
            <div className="card-body">
              <h3>{style.name}</h3>
              <p className="muted">{style.description}</p>
              {busyId === style.id ? (
                <div className="pill">Saving…</div>
              ) : project.styleId === style.id ? (
                <div className="pill success">Selected</div>
              ) : (
                <div className="pill">Select</div>
              )}
            </div>
          </button>
        ))}
      </div>
      {project.styleId ? (
        <button className="btn btn-primary" style={{ marginTop: 18 }} onClick={() => navigate(`/projects/${project.id}/bible`)}>
          Continue with this style
        </button>
      ) : null}
    </div>
  );
}
