import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PRODUCT_NAME, PROJECT_STATUS_LABELS, type ProjectSummary } from '@music-video/shared';
import { api, ApiClientError } from '../lib/api';
import { formatClockShort, formatRelative } from '../lib/time';
import { useSession } from '../hooks/useProject';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';

export function DashboardPage({ onLogout }: { onLogout: () => void }) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ProjectSummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const navigate = useNavigate();
  const session = useSession();

  async function load() {
    try {
      const data = await api.projects();
      setProjects(data.projects);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not load projects.');
    } finally {
      setLoading(false);
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
        <div className="row">
          {session.accessRequired ? (
            <button
              type="button"
              className="text-link"
              onClick={async () => {
                await api.logout().catch(() => undefined);
                onLogout();
                navigate('/access');
              }}
            >
              Sign out
            </button>
          ) : null}
          <Link className="btn btn-primary" to="/projects/new">
            + Create
          </Link>
        </div>
      </header>
      <div className="page">
        {session.imagesDemoMode ? (
          <div className="banner warning">
            Live image generation is off. Set FAL_KEY on the API to generate Flux stills, or walk the editor with demo placeholders.
          </div>
        ) : null}
        {error ? <div className="banner error">{error}</div> : null}
        {loading ? (
          <div className="grid-cards">
            <div className="skeleton" style={{ height: 280 }} />
            <div className="skeleton" style={{ height: 280 }} />
            <div className="skeleton" style={{ height: 280 }} />
          </div>
        ) : projects.length === 0 ? (
          <EmptyState
            title="No films on the desk yet"
            body="Upload a song, pick a look, and the studio storyboards the cut for you."
            action={
              <Link className="btn btn-primary" to="/projects/new">
                Create your first music video
              </Link>
            }
          />
        ) : (
          <div className="grid-cards">
            {projects.map((project) => (
              <article className="card" key={project.id}>
                <div
                  className="card-media"
                  role="img"
                  aria-label={project.name}
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
                  <div className="progress" aria-label={`${project.pipelineActive ? project.pipelineProgress : project.progress}% complete`} role="progressbar" aria-valuenow={project.pipelineActive ? (project.pipelineProgress ?? 0) : project.progress} aria-valuemin={0} aria-valuemax={100}>
                    <span style={{ width: `${project.pipelineActive ? (project.pipelineProgress ?? 0) : project.progress}%` }} />
                  </div>
                  {project.pipelineActive && project.pipelineStage ? (
                    <div className="faint">
                      {project.pipelineStage}
                      {project.pipelineEtaAt
                        ? ` · ready ca ${new Date(project.pipelineEtaAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                        : ''}
                    </div>
                  ) : (
                    <div className="faint">Updated {formatRelative(project.updatedAt)}</div>
                  )}
                  <div className="card-actions">
                    <button
                      className="btn btn-primary"
                      onClick={() =>
                        navigate(
                          project.pipelineActive
                            ? `/projects/${project.id}/pipeline`
                            : `/projects/${project.id}/${project.status === 'complete' ? 'video' : project.nextStep || 'setup'}`,
                        )
                      }
                    >
                      {project.pipelineActive ? 'View progress' : project.status === 'complete' ? 'Watch' : 'Continue'}
                    </button>
                    <div className="card-actions-secondary">
                      <button
                        className="btn"
                        disabled={busyId === project.id}
                        onClick={async () => {
                          setBusyId(project.id);
                          setError(null);
                          try {
                            const copy = await api.duplicateProject(project.id);
                            navigate(`/projects/${copy.project.id}/${copy.project.status === 'complete' || copy.project.status === 'ready_to_render' ? 'video' : 'setup'}`);
                          } catch (err) {
                            setError(err instanceof ApiClientError ? err.message : 'Could not duplicate that project.');
                          } finally {
                            setBusyId(null);
                          }
                        }}
                      >
                        {busyId === project.id ? 'Copying…' : 'Duplicate'}
                      </button>
                      <button className="btn btn-danger" onClick={() => setPendingDelete(project)}>
                        Delete
                      </button>
                    </div>
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
            try {
              await api.deleteProject(pendingDelete.id);
              setPendingDelete(null);
              await load();
            } catch (err) {
              setError(err instanceof ApiClientError ? err.message : 'Could not delete that project.');
              setPendingDelete(null);
            }
          }}
        />
      ) : null}
    </>
  );
}
