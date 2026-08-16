import { useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  EDITOR_STEP_LABELS,
  EDITOR_STEPS,
  computeProjectHealth,
  validateSceneTiming,
  type MusicVideoProject,
  type ProjectHealth,
  type TimelineIssue,
} from '@music-video/shared';
import { api } from '../lib/api';
import { ProjectContext } from '../hooks/useProject';

export function ProjectLayout() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [project, setProjectState] = useState<MusicVideoProject | null>(null);
  const [health, setHealth] = useState<ProjectHealth | null>(null);
  const [timingIssues, setTimingIssues] = useState<TimelineIssue[]>([]);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    if (!id) return;
    const data = await api.project(id);
    setProjectState(data.project);
    setHealth(data.health);
    setTimingIssues(data.timingIssues);
  }

  useEffect(() => {
    reload().catch((err) => setError(err instanceof Error ? err.message : 'Could not load project.'));
  }, [id]);

  const completedSteps = useMemo(() => {
    if (!project || !health) return 0;
    return [
      Boolean(project.audio && project.lyrics.trim()),
      Boolean(project.styleId),
      Boolean(project.visualBibleApproved),
      project.scenes.length > 0,
      health.imagesGenerated > 0,
      health.readyToRender || project.status === 'complete',
    ].filter(Boolean).length;
  }, [project, health]);

  if (error) {
    return (
      <div className="page">
        <div className="banner error">{error}</div>
        <Link to="/">Back to projects</Link>
      </div>
    );
  }
  if (!project || !health) {
    return <div className="page">Opening project…</div>;
  }

  const value = {
    project,
    health,
    timingIssues,
    saveState,
    reload,
    setProject(next: MusicVideoProject, nextHealth?: ProjectHealth, issues?: TimelineIssue[]) {
      setProjectState(next);
      setHealth(nextHealth ?? computeProjectHealth(next));
      setTimingIssues(issues ?? validateSceneTiming(next.scenes, next.durationSeconds));
      setSaveState('saved');
    },
  };

  return (
    <ProjectContext.Provider value={value}>
      <div className="project-header">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <Link to="/" className="faint">
            ← Projects
          </Link>
          <span className="save-dot">
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : `${completedSteps} / 6 completed`}
          </span>
        </div>
        <h1>{project.name}</h1>
      </div>
      <nav className="stepper">
        {EDITOR_STEPS.map((step) => (
          <button
            key={step}
            className={`step ${location.pathname.includes(`/${step}`) ? 'active' : ''}`}
            onClick={() => navigate(`/projects/${project.id}/${step}`)}
          >
            {EDITOR_STEP_LABELS[step]}
          </button>
        ))}
      </nav>
      <Outlet />
    </ProjectContext.Provider>
  );
}
