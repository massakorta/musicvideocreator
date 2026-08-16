import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getExportPreset, RENDER_JOB_STATUS_LABELS, exportDurationFrames, estimateRenderExpectedSeconds, type RenderJob } from '@music-video/shared';
import { api, ApiClientError } from '../lib/api';
import { useProject } from '../hooks/useProject';
import { formatClockShort } from '../lib/time';
import { WaitCard } from '../components/WaitCard';

export function ResultPage() {
  const { jobId } = useParams();
  const { project } = useProject();
  const [job, setJob] = useState<RenderJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!jobId) {
      setError('That render link is missing a job id.');
      return;
    }
    let cancelled = false;
    let timer: number | undefined;
    async function poll() {
      try {
        const data = await api.job(jobId!);
        if (cancelled) return;
        setJob(data.job);
        setError(null);
        if (data.job.status !== 'complete' && data.job.status !== 'failed') {
          timer = window.setTimeout(() => void poll(), 2000);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiClientError ? err.message : 'Could not load this render.');
        timer = window.setTimeout(() => void poll(), 4000);
      }
    }
    void poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [jobId]);

  async function copyShareLink() {
    try {
      const data = await api.share(project.id);
      setShareUrl(data.url);
      await navigator.clipboard.writeText(data.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not create a share link.');
    }
  }

  async function renderAgain() {
    setRetrying(true);
    setError(null);
    try {
      const data = await api.render(project.id);
      navigate(`/projects/${project.id}/result/${data.job.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not start another render.');
    } finally {
      setRetrying(false);
    }
  }

  if (!job && !error) {
    return (
      <div className="page" style={{ maxWidth: 640 }}>
        <WaitCard
          title="Looking up the render"
          expectedSeconds={8}
          stages={['Checking the render queue…']}
        />
      </div>
    );
  }

  if (error && !job) {
    return (
      <div className="page">
        <div className="banner error">{error}</div>
        <Link className="btn" to={`/projects/${project.id}/video`}>
          Back to Editor
        </Link>
      </div>
    );
  }

  if (job?.status === 'failed') {
    return (
      <div className="page">
        <div className="banner error">{job.error || 'The render failed.'}</div>
        <div className="row">
          <button className="btn btn-primary" disabled={retrying} onClick={() => void renderAgain()}>
            {retrying ? 'Queueing…' : 'Retry render'}
          </button>
          <button className="btn" onClick={() => navigate(`/projects/${project.id}/video`)}>
            Back to Editor
          </button>
        </div>
      </div>
    );
  }

  const exportPreset = getExportPreset(project.formatId);
  const exportFrames = exportDurationFrames(project.durationSeconds, project.formatId);
  const renderExpectedSeconds = estimateRenderExpectedSeconds(exportFrames);

  if (job && job.status !== 'complete') {
    return (
      <div className="page" style={{ maxWidth: 640 }}>
        <WaitCard
          title="Rendering the music video"
          current={job.progress}
          total={100}
          expectedSeconds={renderExpectedSeconds}
          detail={RENDER_JOB_STATUS_LABELS[job.status]}
          stages={[
            'Queuing the cut…',
            'Preparing frames…',
            'Rendering the Ken Burns moves…',
            'Uploading the finished MP4…',
          ]}
        />
        {error ? <div className="banner warning">{error} Retrying…</div> : null}
        <p className="muted">
          Export is {exportPreset.width}×{exportPreset.height} at {exportPreset.fps} fps — usually{' '}
          {Math.ceil(renderExpectedSeconds / 60)} min for a {formatClockShort(project.durationSeconds)} song. You can
          leave and come back.
        </p>
      </div>
    );
  }

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <h1>Your Music Video Is Ready</h1>
      {job?.outputUrl ? (
        <video src={job.outputUrl} controls style={{ width: '100%', borderRadius: 16, margin: '16px 0' }} />
      ) : (
        <div className="banner warning">The render finished, but the video file is not available yet. Try rendering again.</div>
      )}
      <p className="muted">
        {exportPreset.width} × {exportPreset.height} · {formatClockShort(project.durationSeconds)}
        {job?.fileSizeBytes ? ` · ${(job.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB` : ''}
      </p>
      <div className="row">
        {job?.outputUrl ? (
          <a className="btn btn-primary" href={job.outputUrl} download="music-video.mp4">
            Download MP4
          </a>
        ) : null}
        <button className="btn" onClick={() => void copyShareLink()}>
          {copied ? 'Link copied!' : 'Copy watch link'}
        </button>
        <Link className="btn" to={`/projects/${project.id}/video`}>
          Back to Editor
        </Link>
        <button className="btn" disabled={retrying} onClick={() => void renderAgain()}>
          {retrying ? 'Queueing…' : 'Render Again'}
        </button>
      </div>
      {shareUrl ? <p className="faint">Share: {shareUrl}</p> : null}
    </div>
  );
}
