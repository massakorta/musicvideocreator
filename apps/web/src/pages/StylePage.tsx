import { useNavigate } from 'react-router-dom';
import { VISUAL_STYLE_PRESETS } from '@music-video/shared';
import { useProject } from '../hooks/useProject';
import { api } from '../lib/api';

export function StylePage() {
  const { project, setProject } = useProject();
  const navigate = useNavigate();

  return (
    <div className="page">
      <p className="hero-copy">The style locks the look of every later still — bible, characters, and scenes.</p>
      <div className="style-grid">
        {VISUAL_STYLE_PRESETS.map((style) => (
          <button
            key={style.id}
            className="card style-card"
            onClick={async () => {
              const data = await api.patchProject(project.id, { styleId: style.id });
              setProject(data.project, data.health);
              navigate(`/projects/${project.id}/bible`);
            }}
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
              {project.styleId === style.id ? <div className="pill success">Selected</div> : <div className="pill">Select</div>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
