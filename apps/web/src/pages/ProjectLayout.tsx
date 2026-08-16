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
  type PipelineStatus,
  type ProjectHealth,
  type StaleAssets,
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
  const [pipeline, setPipeline] = useState<PipelineStatus | null>(null);
  const [stale, setStale] = useState<StaleAssets | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!id) return;
    const data = await api.project(id);
    setProjectState(data.project);
    setHealth(data.health);
    setTimingIssues(data.timingIssues);
    setPipeline(data.pipeline);
    setStale(data.stale);
  }, [id]);

  useEffect(() => {
    reload().catch((err) => setError(err instanceof Error ? err.message : 'Could not load project.'));
  }, [id, reload]);

  useEffect(() => {
    if (!pipeline?.active) return;
    if (location.pathname.includes('/pipeline')) return;
    if (location.pathname.includes('/result/')) return;
    navigate(`/projects/${id}/pipeline`, { replace: true });
  }, [pipeline?.active, location.pathname, navigate, id]);

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
  const pipelineLocked = Boolean(pipeline?.active);

  const value = {
    project,
    health,
    timingIssues,
    pipeline,
    stale,
    saveState,
    reload,
    markSave: setSaveState,
    setProject(
      next: MusicVideoProject,
      nextHealth?: ProjectHealth,
      issues?: TimelineIssue[],
      nextPipeline?: PipelineStatus | null,
      nextStale?: StaleAssets | null,
    ) {
      setProjectState(next);
      setHealth(nextHealth ?? computeProjectHealth(next));
      setTimingIssues(issues ?? validateSceneTiming(next.scenes, next.durationSeconds));
      if (nextPipeline !== undefined) setPipeline(nextPipeline);
      if (nextStale !== undefined) setStale(nextStale);
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
            {pipelineLocked
              ? 'Generating in background…'
              : saveState === 'saving'
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
      {!location.pathname.includes('/pipeline') ? (
        <nav className="stepper" aria-label="Editor steps">
          {EDITOR_STEPS.map((step) => {
            const done = isEditorStepComplete(project, step);
            const active = location.pathname.includes(`/${step}`);
            return (
              <button
                key={step}
                className={`step ${active ? 'active' : ''} ${done ? 'done' : ''} ${step === nextStep && !active ? 'next' : ''}`}
                disabled={pipelineLocked}
                onClick={() => navigate(`/projects/${project.id}/${step}`)}
              >
                {EDITOR_STEP_LABELS[step]}
              </button>
            );
          })}
        </nav>
      ) : null}
      <Outlet />
    </ProjectContext.Provider>
  );
}
