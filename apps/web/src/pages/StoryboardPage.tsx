import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MOTION_PRESET_LABELS, missingCharacterReferences } from '@music-video/shared';
import { useProject } from '../hooks/useProject';
import { api, ApiClientError } from '../lib/api';
import { AudioPlayer } from '../components/AudioPlayer';
import { HealthPanel } from '../components/HealthPanel';
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
        <div className="row" style={{ marginBottom: 14 }}>
          <button className="btn btn-primary" disabled={busy || !project.visualBibleApproved} onClick={() => void generate()}>
            {busy ? 'Creating storyboard…' : project.scenes.length ? 'Regenerate Storyboard' : 'Generate Storyboard'}
          </button>
          <button className="btn" onClick={() => void api.addScene(project.id).then((d) => setProject(d.project))}>
            Add scene
          </button>
        </div>
        {timingIssues.length > 0 ? (
          <div className="banner warning">
            {timingIssues.slice(0, 6).map((issue) => (
              <div key={`${issue.type}-${issue.sceneId}-${issue.message}`}>{issue.message}</div>
            ))}
          </div>
        ) : null}
        <div className="scene-list">
          {project.scenes.map((scene) => (
            <article className="card scene-card" key={scene.id}>
              {scene.image?.publicUrl ? (
                <img className="scene-thumb" src={scene.image.publicUrl} alt="" />
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
                {scene.lyricsExcerpt ? (
                  <p className="muted">
                    Lyrics: “{scene.lyricsExcerpt}”
                  </p>
                ) : null}
                <p>{scene.description}</p>
                <p className="muted">
                  Characters: {scene.characters.join(', ') || '—'} · Location: {scene.environmentId || '—'} · Motion:{' '}
                  {MOTION_PRESET_LABELS[scene.motion]}
                </p>
              </div>
              <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <button className="btn" onClick={() => setSelectedId(scene.id)}>
                  Edit
                </button>
                <button className="btn" onClick={() => void api.duplicateScene(project.id, scene.id).then((d) => setProject(d.project))}>
                  Duplicate
                </button>
                <button className="btn btn-danger" onClick={() => void api.deleteScene(project.id, scene.id).then((d) => setProject(d.project))}>
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
        <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate(`/projects/${project.id}/images`)}>
          Continue to images
        </button>
      </div>
      <div>
        <HealthPanel health={health} />
        {selected ? (
          <SceneEditor
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
