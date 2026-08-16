import { useEffect, useMemo, useRef, useState } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { MusicVideoComposition, compositionDurationFrames, projectToComposition } from '@music-video/video';
import { getVideoPreset } from '@music-video/shared';
import { Link, useNavigate } from 'react-router-dom';
import { useProject } from '../hooks/useProject';
import { api, ApiClientError } from '../lib/api';
import { HealthPanel } from '../components/HealthPanel';
import { SceneEditor } from '../components/SceneEditor';
import { formatClock } from '../lib/time';

export function VideoPage() {
  const { project, health, reload } = useProject();
  const player = useRef<PlayerRef>(null);
  const [frame, setFrame] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const navigate = useNavigate();
  const composition = useMemo(() => projectToComposition(project), [project]);
  const preset = getVideoPreset(project.formatId);
  const durationInFrames = compositionDurationFrames(composition);
  const selected = project.scenes.find((s) => s.id === selectedId);
  const currentSeconds = frame / preset.fps;

  useEffect(() => {
    const instance = player.current;
    if (!instance) return;
    const onUpdate = ({ detail }: { detail: { frame: number } }) => setFrame(detail.frame);
    instance.addEventListener('frameupdate', onUpdate);
    return () => instance.removeEventListener('frameupdate', onUpdate);
  }, [composition.scenes.length, composition.durationSeconds]);

  return (
    <div className="page editor-layout">
      <div>
        {error ? <div className="banner error">{error}</div> : null}
        {!health.readyToRender ? (
          <div className="banner warning">
            <strong>Cannot render yet</strong>
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
        <div className="preview-stage">
          {composition.scenes.length > 0 ? (
            <Player
              ref={player}
              component={MusicVideoComposition}
              inputProps={{ project: composition }}
              durationInFrames={durationInFrames}
              fps={preset.fps}
              compositionWidth={preset.width}
              compositionHeight={preset.height}
              style={{ width: '100%', height: '100%' }}
              controls
              autoPlay={false}
              clickToPlay
              doubleClickToFullscreen
              acknowledgeRemotionLicense
            />
          ) : (
            <div className="drop">
              {project.scenes.length === 0
                ? 'Generate a storyboard, then stills, to preview the cut.'
                : 'Generate scene stills to preview the Ken Burns cut.'}
            </div>
          )}
        </div>
        <div className="row" style={{ margin: '10px 0' }}>
          <span className="mono">
            {formatClock(currentSeconds)} / {formatClock(project.durationSeconds)}
          </span>
        </div>
        <Timeline
          duration={project.durationSeconds}
          current={currentSeconds}
          onSeek={(seconds) => player.current?.seekTo(Math.round(seconds * preset.fps))}
          onSelect={(id) => {
            setSelectedId(id);
            const scene = project.scenes.find((s) => s.id === id);
            if (scene) player.current?.seekTo(Math.round(scene.startTime * preset.fps));
          }}
        />
        <div className="row" style={{ marginTop: 16 }}>
          <button
            className="btn btn-primary"
            disabled={!health.readyToRender || rendering}
            onClick={async () => {
              setRendering(true);
              setError(null);
              try {
                const data = await api.render(project.id);
                navigate(`/projects/${project.id}/result/${data.job.id}`);
              } catch (err) {
                setError(err instanceof ApiClientError ? err.message : 'Could not start the render.');
              } finally {
                setRendering(false);
              }
            }}
          >
            {rendering ? 'Queueing render…' : 'Render Music Video'}
          </button>
        </div>
      </div>
      <div>
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
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        onSeek(ratio * duration);
      }}
    >
      <div className="faint">Audio</div>
      <div className="timeline-track" style={{ height: 10, margin: '6px 0 10px', background: '#3a3328' }} />
      <div className="timeline-track">
        {project.scenes.map((scene, index) => (
          <button
            key={scene.id}
            className="timeline-block"
            style={{
              width: `${((scene.endTime - scene.startTime) / Math.max(duration, 0.01)) * 100}%`,
              background: index % 2 === 0 ? '#3b3124' : '#2c261d',
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
