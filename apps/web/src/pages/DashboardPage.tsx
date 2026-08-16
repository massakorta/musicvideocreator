import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PRODUCT_NAME, PROJECT_STATUS_LABELS, type ProjectSummary } from '@music-video/shared';
import { api, ApiClientError } from '../lib/api';
import { formatClockShort, formatRelative } from '../lib/time';
import { useSession } from '../hooks/useProject';
import { ConfirmDialog } from '../components/ConfirmDialog';

export function DashboardPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ProjectSummary | null>(null);
  const navigate = useNavigate();
  const session = useSession();

  async function load() {
    try {
      const data = await api.projects();
      setProjects(data.projects);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not load projects.');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <small>Studio</small>
          <strong>{PRODUCT_NAME}</strong>
        </div>
        <Link className="btn btn-primary" to="/projects/new">
          + Create Music Video
        </Link>
      </header>
      <div className="page">
        {session.demoMode ? (
          <div className="banner warning">
            OpenAI is not configured. You can still walk the full editor with demo generation. Add
            OPENAI_API_KEY to enable live visual bibles and images.
          </div>
        ) : null}
        {error ? <div className="banner error">{error}</div> : null}
        {projects.length === 0 ? (
          <div className="drop">
            No projects yet. Create a music video to start the director’s desk.
          </div>
        ) : (
          <div className="grid-cards">
            {projects.map((project) => (
              <article className="card" key={project.id}>
                <div
                  className="card-media"
                  style={{
                    backgroundImage: project.thumbnailUrl ? `url(${project.thumbnailUrl})` : undefined,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                />
                <div className="card-body">
                  <h3>{project.name}</h3>
                  <div className="muted">{project.songTitle || 'Untitled song'}</div>
                  <div className="row" style={{ marginTop: 10, justifyContent: 'space-between' }}>
                    <span className="pill">{PROJECT_STATUS_LABELS[project.status]}</span>
                    <span className="mono faint">{formatClockShort(project.durationSeconds)}</span>
                  </div>
                  <div className="progress" aria-label="progress">
                    <span style={{ width: `${project.progress}%` }} />
                  </div>
                  <div className="faint">Updated {formatRelative(project.updatedAt)}</div>
                  <div className="row" style={{ marginTop: 14 }}>
                    <button className="btn btn-primary" onClick={() => navigate(`/projects/${project.id}/setup`)}>
                      Open
                    </button>
                    <button
                      className="btn"
                      onClick={async () => {
                        const copy = await api.duplicateProject(project.id);
                        navigate(`/projects/${copy.project.id}/setup`);
                      }}
                    >
                      Duplicate
                    </button>
                    <button className="btn btn-danger" onClick={() => setPendingDelete(project)}>
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      {pendingDelete ? (
        <ConfirmDialog
          title={`Delete ${pendingDelete.name}?`}
          body="This removes the project, storyboard, and generated files from this studio."
          confirmLabel="Delete project"
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => {
            await api.deleteProject(pendingDelete.id);
            setPendingDelete(null);
            await load();
          }}
        />
      ) : null}
    </>
  );
}
