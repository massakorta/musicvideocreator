import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { VISUAL_STYLE_PRESETS } from '@music-video/shared';
import { useProject } from '../hooks/useProject';
import { api, ApiClientError } from '../lib/api';
import { WaitCard } from '../components/WaitCard';

export function StylePage() {
  const { project, setProject } = useProject();
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canGenerateAll = Boolean(project.audio && project.lyrics.trim());

  async function choose(styleId: string) {
    setBusyId(styleId);
    setError(null);
    try {
      const data = await api.patchProject(project.id, { styleId });
      setProject(data.project, data.health);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not save that style.');
    } finally {
      setBusyId(null);
    }
  }

  async function generateAll() {
    if (!project.styleId) {
      setError('Pick a visual style first.');
      return;
    }
    setGeneratingAll(true);
    setError(null);
    try {
      if (project.styleId) {
        await api.patchProject(project.id, { styleId: project.styleId });
      }
      await api.generateAll(project.id);
      navigate(`/projects/${project.id}/pipeline`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not start background generation.');
    } finally {
      setGeneratingAll(false);
    }
  }

  return (
    <div className="page">
      <p className="hero-copy">
        Pick the look. Every later still — bible, characters, and scenes — stays inside this world.
      </p>
      {error ? <div className="banner error">{error}</div> : null}
      {busyId || generatingAll ? (
        <WaitCard
          title={generatingAll ? 'Starting background generation' : 'Locking the look'}
          expectedSeconds={generatingAll ? 8 : 6}
          stages={
            generatingAll
              ? ['Queuing bible, storyboard, stills, and render…']
              : ['Saving the style so every later still stays in this world…']
          }
        />
      ) : null}
      <div className="style-grid">
        {VISUAL_STYLE_PRESETS.map((style) => (
          <button
            key={style.id}
            className={`card style-card ${project.styleId === style.id ? 'selected' : ''}`}
            disabled={Boolean(busyId) || generatingAll}
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
        <div className="row" style={{ marginTop: 18, flexWrap: 'wrap', gap: 10 }}>
          <button
            className="btn btn-primary"
            disabled={!canGenerateAll || generatingAll || Boolean(busyId)}
            onClick={() => void generateAll()}
          >
            Generera allt åt mig!
          </button>
          <button
            className="btn"
            disabled={generatingAll || Boolean(busyId)}
            onClick={() => navigate(`/projects/${project.id}/bible`)}
          >
            Jag styr själv
          </button>
        </div>
      ) : null}
      {!canGenerateAll ? (
        <p className="faint" style={{ marginTop: 10 }}>
          Upload a song and paste lyrics on the Song step before autopilot can run.
        </p>
      ) : null}
    </div>
  );
}
