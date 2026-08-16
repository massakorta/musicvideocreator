import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { RenderJob } from '@music-video/shared';
import { api } from '../lib/api';
import { useProject } from '../hooks/useProject';
import { formatClockShort } from '../lib/time';

export function ResultPage() {
  const { jobId } = useParams();
  const { project } = useProject();
  const [job, setJob] = useState<RenderJob | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!jobId) return;
    let timer: number | undefined;
    async function poll() {
      const data = await api.job(jobId!);
      setJob(data.job);
      if (data.job.status !== 'complete' && data.job.status !== 'failed') {
        timer = window.setTimeout(() => void poll(), 2500);
      }
    }
    void poll();
    return () => window.clearTimeout(timer);
  }, [jobId]);

  if (!job) return <div className="page">Loading render…</div>;

  if (job.status === 'failed') {
    return (
      <div className="page">
        <div className="banner error">{job.error || 'The render failed.'}</div>
        <button className="btn" onClick={() => navigate(`/projects/${project.id}/video`)}>
          Back to Editor
        </button>
      </div>
    );
  }

  if (job.status !== 'complete') {
    return (
      <div className="page" style={{ maxWidth: 640 }}>
        <h1>Rendering video</h1>
        <p className="muted">{job.status}</p>
        <div className="progress" style={{ height: 10 }}>
          <span style={{ width: `${job.progress}%` }} />
        </div>
        <p className="mono">{job.progress}%</p>
      </div>
    );
  }

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <h1>Your Music Video Is Ready</h1>
      {job.outputUrl ? (
        <video src={job.outputUrl} controls style={{ width: '100%', borderRadius: 16, margin: '16px 0' }} />
      ) : null}
      <p className="muted">
        1920 × 1080 · {formatClockShort(project.durationSeconds)}
        {job.fileSizeBytes ? ` · ${(job.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB` : ''}
      </p>
      <div className="row">
        {job.outputUrl ? (
          <a className="btn btn-primary" href={job.outputUrl} download="music-video.mp4">
            Download MP4
          </a>
        ) : null}
        <Link className="btn" to={`/projects/${project.id}/video`}>
          Back to Editor
        </Link>
        <button
          className="btn"
          onClick={async () => {
            const data = await api.render(project.id);
            navigate(`/projects/${project.id}/result/${data.job.id}`);
          }}
        >
          Render Again
        </button>
      </div>
    </div>
  );
}
