import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PIPELINE_STAGE_LABELS, type PipelineJob } from '@music-video/shared';
import { useProject } from '../hooks/useProject';
import { api, ApiClientError } from '../lib/api';
import { formatClockShort } from '../lib/time';
import { WaitCard } from '../components/WaitCard';

function formatEta(iso?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function PipelinePage() {
  const { project, health, reload } = useProject();
  const [job, setJob] = useState<PipelineJob | null>(null);
  const [etaAt, setEtaAt] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    async function poll() {
      try {
        const data = await api.pipeline(project.id);
        if (cancelled) return;
        setError(null);
        setJob(data.job);
        setEtaAt(data.etaAt);
        if (data.active) {
          timer = window.setTimeout(() => void poll(), 2000);
          return;
        }
        if (data.job?.status === 'complete') {
          await reload();
          navigate(`/projects/${project.id}/video`, { replace: true });
          return;
        }
        if (data.job?.status === 'failed') {
          setError(data.job.error || 'Background generation failed.');
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiClientError ? err.message : 'Could not load progress.');
        timer = window.setTimeout(() => void poll(), 4000);
      }
    }

    void poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [navigate, project.id, reload]);

  if (!job && !error) {
    return (
      <div className="page" style={{ maxWidth: 640 }}>
        <WaitCard title="Starting background generation" expectedSeconds={10} stages={['Queuing the job…']} />
      </div>
    );
  }

  if (job?.status === 'failed') {
    return (
      <div className="page" style={{ maxWidth: 640 }}>
        <div className="banner error">{job.error || error || 'Generation failed.'}</div>
        <div className="row">
          {health.readyToRender ? (
            <button
              className="btn btn-primary"
              onClick={async () => {
                try {
                  const data = await api.share(project.id);
                  await navigator.clipboard.writeText(data.url);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2000);
                } catch (err) {
                  setError(err instanceof ApiClientError ? err.message : 'Could not copy share link.');
                }
              }}
            >
              {copied ? 'Preview link copied!' : 'Copy preview link'}
            </button>
          ) : null}
          <Link className="btn btn-primary" to={`/projects/${project.id}/images`}>
            Open editor
          </Link>
          <Link className="btn" to="/">
            Back to projects
          </Link>
        </div>
      </div>
    );
  }

  const stageLabel = job ? PIPELINE_STAGE_LABELS[job.stage] : 'Working';
  const progress = job?.progress ?? 0;
  const expectedSeconds = job?.expectedSeconds ?? 300;

  return (
    <div className="page" style={{ maxWidth: 640 }}>
      <p className="hero-copy">
        The studio is building your film in the background. You can close this tab — progress is saved on the server.
      </p>
      <WaitCard
        title={job?.kind === 'stale_assets' ? 'Updating changed assets' : 'Generating your music video'}
        current={progress}
        total={100}
        expectedSeconds={expectedSeconds}
        detail={job?.stageDetail || stageLabel}
        stages={[
          'Writing the visual bible…',
          'Painting character references…',
          'Cutting the storyboard…',
          'Generating scene stills…',
        ]}
      />
      {etaAt ? (
        <p className="muted" style={{ marginTop: 12 }}>
          Estimated ready around {formatEta(etaAt)} · {formatClockShort(project.durationSeconds)} song
        </p>
      ) : null}
      {job?.charactersTotal ? (
        <p className="faint">
          Characters {job.charactersDone}/{job.charactersTotal}
          {job.imagesTotal ? ` · Stills ${job.imagesDone}/${job.imagesTotal}` : ''}
        </p>
      ) : job?.imagesTotal ? (
        <p className="faint">
          Stills {job.imagesDone}/{job.imagesTotal}
        </p>
      ) : null}
      {error ? <div className="banner warning">{error}</div> : null}
      <Link className="btn" to="/" style={{ marginTop: 16 }}>
        Back to projects
      </Link>
    </div>
  );
}
