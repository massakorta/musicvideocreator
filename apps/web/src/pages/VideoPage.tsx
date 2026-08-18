import { useCallback, useMemo, useRef, useState } from 'react';
import { compositionDurationFrames, projectToComposition } from '@music-video/video';
import { getVideoPreset } from '@music-video/shared';
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
  const navigate = useNavigate();
  const composition = useMemo(() => projectToComposition(project), [project]);
  const preset = getVideoPreset(project.formatId);
  const durationInFrames = compositionDurationFrames(composition);
  const selected = project.scenes.find((s) => s.id === selectedId);
  const currentSeconds = frame / preset.fps;
  const currentScene = project.scenes.find(
    (scene) => currentSeconds >= scene.startTime && currentSeconds < scene.endTime,
  ) ?? project.scenes.at(-1);
  const onFrame = useCallback((next: number) => setFrame(next), []);

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
              {copied ? 'Link copied!' : 'Copy preview link'}
            </button>
          ) : null}
        </div>
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
