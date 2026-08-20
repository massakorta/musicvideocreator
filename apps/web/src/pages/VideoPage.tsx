import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { compositionDurationFrames, projectToComposition } from '@music-video/video';
import { getVideoPreset, exportDurationFrames, estimateRenderExpectedSeconds, RENDER_JOB_STATUS_LABELS, type RenderJob } from '@music-video/shared';
import { Link, useNavigate } from 'react-router-dom';
import { useProject } from '../hooks/useProject';
import { api, ApiClientError } from '../lib/api';
import { HealthPanel } from '../components/HealthPanel';
import { SceneEditor } from '../components/SceneEditor';
import { SyncedPreview, type SyncedPreviewHandle } from '../components/SyncedPreview';
import { formatClock } from '../lib/time';

export function VideoPage() {
  const { project, health, stale, reload } = useProject();
  const preview = useRef<SyncedPreviewHandle>(null);
  const [frame, setFrame] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedVideo, setCopiedVideo] = useState(false);
  const [renderJob, setRenderJob] = useState<RenderJob | null>(null);
  const [renderBusy, setRenderBusy] = useState(false);
  const [shareLinks, setShareLinks] = useState<{ url: string; videoFileUrl?: string } | null>(null);
  const [lastRenderProgress, setLastRenderProgress] = useState<number | null>(null);
  const [lastRenderProgressAt, setLastRenderProgressAt] = useState<number>(Date.now());
  const navigate = useNavigate();
  const composition = useMemo(() => projectToComposition(project), [project]);
  const preset = getVideoPreset(project.formatId);
  const durationInFrames = compositionDurationFrames(composition);
  const exportFrames = exportDurationFrames(project.durationSeconds, project.formatId);
  const exportEtaMinutes = Math.max(2, Math.ceil(estimateRenderExpectedSeconds(exportFrames) / 60));
  const selected = project.scenes.find((s) => s.id === selectedId);
  const currentSeconds = frame / preset.fps;
  const currentScene = project.scenes.find(
    (scene) => currentSeconds >= scene.startTime && currentSeconds < scene.endTime,
  ) ?? project.scenes.at(-1);
  const onFrame = useCallback((next: number) => setFrame(next), []);

  const renderActive =
    renderJob?.status === 'queued' ||
    renderJob?.status === 'preparing' ||
    renderJob?.status === 'rendering' ||
    renderJob?.status === 'uploading';
  const renderComplete = renderJob?.status === 'complete';
  const renderFailed = renderJob?.status === 'failed';

  useEffect(() => {
    let cancelled = false;
    void api.jobs(project.id).then(({ jobs }) => {
      if (cancelled) return;
      const latestComplete = jobs.find((job) => job.status === 'complete');
      const active = jobs.find(
        (job) =>
          job.status === 'queued' ||
          job.status === 'preparing' ||
          job.status === 'rendering' ||
          job.status === 'uploading',
      );
      setRenderJob(active ?? latestComplete ?? jobs[0] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  useEffect(() => {
    if (!renderComplete) return;
    void api.share(project.id).then((links) => {
      setShareLinks({ url: links.url, videoFileUrl: links.videoFileUrl });
    });
  }, [project.id, renderComplete]);

  useEffect(() => {
    if (!renderJob || renderJob.status === 'complete' || renderJob.status === 'failed') return;
    const timer = window.setInterval(() => {
      void api.job(renderJob.id).then(({ job }) => {
        setRenderJob((current) => {
          if (current && job.progress !== current.progress) {
            setLastRenderProgress(job.progress);
            setLastRenderProgressAt(Date.now());
          }
          return job;
        });
        if (job.status === 'complete' || job.status === 'failed') {
          setRenderBusy(false);
        }
      });
    }, 2500);
    return () => window.clearInterval(timer);
  }, [renderJob?.id, renderJob?.status]);

  const renderProgressStale =
    renderActive &&
    lastRenderProgress !== null &&
    renderJob?.progress === lastRenderProgress &&
    Date.now() - lastRenderProgressAt > 3 * 60 * 1000;

  async function startRender() {
    setRenderBusy(true);
    setError(null);
    try {
      const { job } = await api.render(project.id);
      setRenderJob(job);
    } catch (err) {
      setRenderBusy(false);
      setError(err instanceof ApiClientError ? err.message : 'Could not start MP4 export.');
    }
  }

  async function copyShareLink(kind: 'watch' | 'video') {
    try {
      const links = shareLinks ?? (await api.share(project.id));
      setShareLinks({ url: links.url, videoFileUrl: links.videoFileUrl });
      const target = kind === 'video' ? links.videoFileUrl : links.url;
      if (!target) {
        setError(kind === 'video' ? 'Generate an MP4 before copying the direct video link.' : 'Could not copy link.');
        return;
      }
      await navigator.clipboard.writeText(target);
      if (kind === 'video') {
        setCopiedVideo(true);
        window.setTimeout(() => setCopiedVideo(false), 2000);
      } else {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not copy link.');
    }
  }

  return (
    <div className="page editor-layout">
      <div>
        {error ? <div className="banner error">{error}</div> : null}
        {!health.readyToRender ? (
          <div className="banner warning">
            <strong>Cannot share yet</strong>
            {health.missingImages.length > 0 ? (
              <div>
                {health.missingImages.length} scenes are missing images.{' '}
                <Link to={`/projects/${project.id}/images`}>Generate them</Link>
                <ul className="list">
                  {health.missingImages.slice(0, 8).map((title) => (
                    <li key={title}>{title}</li>
                  ))}
                </ul>
              </div>
            ) : (
              health.blockers.map((b) => <div key={b}>{b}</div>)
            )}
          </div>
        ) : null}
        <div className="preview-wrap">
          {composition.scenes.length > 0 ? (
            <SyncedPreview
              ref={preview}
              composition={composition}
              durationInFrames={durationInFrames}
              fps={preset.fps}
              width={preset.width}
              height={preset.height}
              audioUrl={project.audio?.url}
              onFrame={onFrame}
            />
          ) : (
            <div className="drop">
              {project.scenes.length === 0
                ? 'Generate a storyboard, then stills, to preview the cut.'
                : 'Generate scene stills to preview the Ken Burns cut.'}
            </div>
          )}
        </div>
        <div className="row" style={{ margin: '10px 0', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <span className="mono">
            {formatClock(currentSeconds)} / {formatClock(project.durationSeconds)}
          </span>
          {currentScene?.lyricsExcerpt ? (
            <span className="muted">“{currentScene.lyricsExcerpt}”</span>
          ) : null}
        </div>
        <Timeline
          duration={project.durationSeconds}
          current={currentSeconds}
          onSeek={(seconds) => preview.current?.seekToSeconds(seconds)}
          onSelect={(id) => {
            setSelectedId(id);
            const scene = project.scenes.find((s) => s.id === id);
            if (scene) preview.current?.seekToSeconds(scene.startTime);
          }}
        />
        <div className="actions" style={{ marginTop: 16 }}>
          {stale && stale.totalStaleImages > 0 ? (
            <button
              className="btn btn-primary"
              disabled={regenerating}
              onClick={async () => {
                setRegenerating(true);
                setError(null);
                try {
                  await api.regenerateStale(project.id);
                  navigate(`/projects/${project.id}/pipeline`);
                } catch (err) {
                  setError(err instanceof ApiClientError ? err.message : 'Could not start updates.');
                } finally {
                  setRegenerating(false);
                }
              }}
            >
              {regenerating ? 'Queueing…' : `Uppdatera ändrade bilder (${stale.totalStaleImages})`}
            </button>
          ) : null}
          {health.readyToRender ? (
            <>
              <button
                className="btn btn-primary"
                disabled={renderBusy || renderActive}
                onClick={() => void startRender()}
              >
                {renderBusy || renderActive
                  ? RENDER_JOB_STATUS_LABELS[renderJob?.status ?? 'queued']
                  : renderComplete && !(stale?.videoStale)
                    ? 'Re-export MP4'
                    : 'Generate MP4'}
              </button>
              <button className="btn" onClick={() => void copyShareLink('watch')}>
                {copied ? 'Watch link copied!' : 'Copy watch link'}
              </button>
              {renderComplete ? (
                <button className="btn" onClick={() => void copyShareLink('video')}>
                  {copiedVideo ? 'MP4 link copied!' : 'Copy MP4 link'}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
        {health.readyToRender ? (
          <div className="panel" style={{ marginTop: 16 }}>
            <h3 style={{ marginTop: 0 }}>MP4 export</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              Renders one finished H.264 file with Remotion. Share links use the MP4 when it exists, so phones play it
              natively instead of the live preview player. A {formatClock(project.durationSeconds)} film usually takes
              about {exportEtaMinutes} minutes on the export worker.
            </p>
            {renderProgressStale ? (
              <p className="banner warning" style={{ marginBottom: 12 }}>
                Progress has not moved for a few minutes. The worker may still be busy, or the current export may have
                stalled — check worker logs, then try Generate MP4 again after redeploying the worker.
              </p>
            ) : null}
            {stale?.videoStale ? (
              <p className="banner warning" style={{ marginBottom: 12 }}>
                The cut changed since the last export. Generate a fresh MP4 before sharing.
              </p>
            ) : null}
            {renderJob ? (
              <>
                <p className="mono">
                  {RENDER_JOB_STATUS_LABELS[renderJob.status]}
                  {renderActive ? ` · ${Math.round(renderJob.progress)}%` : null}
                </p>
                {renderActive ? (
                  <div
                    className="timeline-track"
                    style={{ height: 8, marginTop: 8, background: '#2a2234', position: 'relative' }}
                    aria-hidden
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.max(0, Math.min(100, renderJob.progress))}%`,
                        background: 'var(--live)',
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>
                ) : null}
                {renderFailed && renderJob.error ? (
                  <p className="banner error" style={{ marginTop: 12 }}>
                    {renderJob.error}
                  </p>
                ) : null}
                {renderComplete ? (
                  <p className="faint" style={{ marginTop: 12, marginBottom: 0 }}>
                    Ready to share. Watch page serves the MP4; “Copy MP4 link” points straight to the file.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="faint" style={{ marginBottom: 0 }}>
                No export yet. Rendering runs in the background worker and usually takes a few minutes.
              </p>
            )}
          </div>
        ) : null}
      </div>
      <div className="editor-sidebar">
        <HealthPanel health={health} />
        {selected ? (
          <SceneEditor
            key={selected.id}
            scene={selected}
            onClose={() => setSelectedId(null)}
            onSaved={async () => {
              await reload();
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

function Timeline({
  duration,
  current,
  onSeek,
  onSelect,
}: {
  duration: number;
  current: number;
  onSeek: (seconds: number) => void;
  onSelect: (id: string) => void;
}) {
  const { project } = useProject();
  return (
    <div
      className="timeline"
      onClick={(e) => {
        const track = e.currentTarget.querySelector('.timeline-track:last-of-type');
        if (!track) return;
        const rect = track.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        onSeek(Math.max(0, Math.min(1, ratio)) * duration);
      }}
    >
      <div className="faint">Audio</div>
      <div className="timeline-track" style={{ height: 10, margin: '6px 0 10px', background: '#2a2234' }} />
      <div className="timeline-track">
        {project.scenes.map((scene, index) => (
          <button
            key={scene.id}
            type="button"
            className="timeline-block"
            style={{
              width: `${Math.max(((scene.endTime - scene.startTime) / Math.max(duration, 0.01)) * 100, 8)}%`,
              background: index % 2 === 0 ? '#2a2234' : '#1f1b28',
            }}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(scene.id);
            }}
          >
            {scene.title || scene.order}
          </button>
        ))}
      </div>
      <div className="playhead" style={{ left: `${(current / Math.max(duration, 0.01)) * 100}%` }} />
    </div>
  );
}
