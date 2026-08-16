import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MOTION_PRESET_LABELS, characterNames, environmentName, missingCharacterReferences } from '@music-video/shared';
import { useProject } from '../hooks/useProject';
import { api, ApiClientError } from '../lib/api';
import { AudioPlayer } from '../components/AudioPlayer';
import { HealthPanel } from '../components/HealthPanel';
import { EmptyState } from '../components/EmptyState';
import { WaitCard } from '../components/WaitCard';
import { formatClockShort } from '../lib/time';
import { SceneEditor } from '../components/SceneEditor';

export function StoryboardPage() {
  const { project, setProject, health, timingIssues, reload } = useProject();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const navigate = useNavigate();
  const missingRefs = missingCharacterReferences(project.scenes, project.visualBible);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const data = await api.generateStoryboard(project.id);
      setProject(data.project);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Storyboard generation failed.');
    } finally {
      setBusy(false);
    }
  }

  const selected = project.scenes.find((s) => s.id === selectedId);

  return (
    <div className="page editor-layout">
      <div>
        <AudioPlayer src={project.audio?.url} duration={project.durationSeconds} />
        {missingRefs.length > 0 ? (
          <div className="banner warning">
            Character reference missing: {missingRefs.map((c) => c.name).join(', ')}. You can still generate images.
          </div>
        ) : null}
        {error ? <div className="banner error">{error}</div> : null}
        {busy ? (
          <WaitCard
            title="Cutting the storyboard"
            expectedSeconds={Math.max(40, Math.round(project.durationSeconds * 0.35))}
            stages={[
              'Mapping verses, choruses, and turns…',
              'Timing frozen moments to the song…',
              'Writing the stills and camera moves…',
              'Still directing — this is the long beat.',
            ]}
          />
        ) : null}
        <div className="row" style={{ marginBottom: 14 }}>
          <button className="btn btn-primary" disabled={busy || !project.visualBibleApproved} onClick={() => void generate()}>
            {busy ? 'Creating storyboard…' : project.scenes.length ? 'Regenerate Storyboard' : 'Generate Storyboard'}
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={async () => {
              try {
                const data = await api.addScene(project.id);
                setProject(data.project);
              } catch (err) {
                setError(err instanceof ApiClientError ? err.message : 'Could not add a scene.');
              }
            }}
          >
            Add scene
          </button>
        </div>
        {!project.visualBibleApproved ? (
          <div className="banner warning">
            Approve the visual bible before generating a storyboard.{' '}
            <Link to={`/projects/${project.id}/bible`}>Open bible</Link>
          </div>
        ) : null}
        {timingIssues.length > 0 ? (
          <div className="banner warning">
            {timingIssues.slice(0, 6).map((issue) => (
              <div key={`${issue.type}-${issue.sceneId}-${issue.message}`}>{issue.message}</div>
            ))}
            {timingIssues.length > 6 ? <div className="faint">+ {timingIssues.length - 6} more timing notes</div> : null}
          </div>
        ) : null}
        {project.scenes.length === 0 ? (
          <EmptyState
            title="No scenes yet"
            body={
              project.visualBibleApproved
                ? 'Generate a storyboard from the lyrics, or add a scene by hand.'
                : 'Approve the visual bible, then generate the cut.'
            }
            action={
              project.visualBibleApproved ? (
                <button className="btn btn-primary" disabled={busy} onClick={() => void generate()}>
                  {busy ? 'Creating storyboard…' : 'Generate Storyboard'}
                </button>
              ) : (
                <Link className="btn btn-primary" to={`/projects/${project.id}/bible`}>
                  Go to visual bible
                </Link>
              )
            }
          />
        ) : (
          <div className="scene-list">
            {project.scenes.map((scene) => (
              <article className="card scene-card" key={scene.id}>
                {scene.image?.publicUrl ? (
                  <img className="scene-thumb" src={scene.image.publicUrl} alt={scene.title} />
                ) : (
                  <div className="scene-thumb" />
                )}
                <div>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <strong>
                      Scene {scene.order} · {scene.title}
                    </strong>
                    <span className="mono faint">
                      {formatClockShort(scene.startTime)} – {formatClockShort(scene.endTime)}
                    </span>
                  </div>
                  <div className="pill">{scene.songSection}</div>
                  {scene.lyricsExcerpt ? <p className="muted">Lyrics: “{scene.lyricsExcerpt}”</p> : null}
                  <p>{scene.description}</p>
                  <p className="muted">
                    Characters: {characterNames(project, scene.characters)} · Location:{' '}
                    {environmentName(project, scene.environmentId)} · Motion: {MOTION_PRESET_LABELS[scene.motion]}
                  </p>
                </div>
                <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                  <button className="btn" onClick={() => setSelectedId(scene.id)}>
                    Edit
                  </button>
                  <button
                    className="btn"
                    onClick={async () => {
                      try {
                        const data = await api.duplicateScene(project.id, scene.id);
                        setProject(data.project);
                      } catch (err) {
                        setError(err instanceof ApiClientError ? err.message : 'Could not duplicate that scene.');
                      }
                    }}
                  >
                    Duplicate
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={async () => {
                      try {
                        const data = await api.deleteScene(project.id, scene.id);
                        setProject(data.project);
                        if (selectedId === scene.id) setSelectedId(null);
                      } catch (err) {
                        setError(err instanceof ApiClientError ? err.message : 'Could not delete that scene.');
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
        <button
          className="btn btn-primary"
          style={{ marginTop: 16 }}
          disabled={project.scenes.length === 0}
          onClick={() => navigate(`/projects/${project.id}/images`)}
        >
          Continue to images
        </button>
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
