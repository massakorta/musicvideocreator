import { useCallback, useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  EDITOR_STEP_LABELS,
  EDITOR_STEPS,
  completedEditorStepCount,
  computeProjectHealth,
  isEditorStepComplete,
  nextEditorStep,
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

  const reload = useCallback(async () => {
    if (!id) return;
    const data = await api.project(id);
    setProjectState(data.project);
    setHealth(data.health);
    setTimingIssues(data.timingIssues);
  }, [id]);

  useEffect(() => {
    reload().catch((err) => setError(err instanceof Error ? err.message : 'Could not load project.'));
  }, [id, reload]);

  if (error) {
    return (
      <div className="page">
        <div className="banner error">{error}</div>
        <Link className="btn" to="/">
          Back to projects
        </Link>
      </div>
    );
  }
  if (!project || !health) {
    return (
      <div className="page">
        <div className="skeleton" style={{ height: 48, marginBottom: 16 }} />
        <div className="skeleton" style={{ height: 240 }} />
      </div>
    );
  }

  const completed = completedEditorStepCount(project);
  const nextStep = nextEditorStep(project);

  const value = {
    project,
    health,
    timingIssues,
    saveState,
    reload,
    markSave: setSaveState,
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
            {saveState === 'saving'
              ? 'Saving…'
              : saveState === 'error'
                ? 'Save failed'
                : saveState === 'saved'
                  ? 'Saved'
                  : `${completed} / ${EDITOR_STEPS.length} completed`}
          </span>
        </div>
        <h1>{project.name}</h1>
      </div>
      <nav className="stepper" aria-label="Editor steps">
        {EDITOR_STEPS.map((step) => {
          const done = isEditorStepComplete(project, step);
          const active = location.pathname.includes(`/${step}`);
          return (
            <button
              key={step}
              className={`step ${active ? 'active' : ''} ${done ? 'done' : ''} ${step === nextStep && !active ? 'next' : ''}`}
              onClick={() => navigate(`/projects/${project.id}/${step}`)}
            >
              {EDITOR_STEP_LABELS[step]}
            </button>
          );
        })}
      </nav>
      <Outlet />
    </ProjectContext.Provider>
  );
}
