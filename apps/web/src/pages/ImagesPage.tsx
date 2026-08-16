import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GENERATION_STATE_LABELS, MOTION_PRESET_LABELS, missingCharacterReferences } from '@music-video/shared';
import { useProject } from '../hooks/useProject';
import { api, ApiClientError } from '../lib/api';
import { formatClockShort } from '../lib/time';
import { HealthPanel } from '../components/HealthPanel';
import { EmptyState } from '../components/EmptyState';
import { SceneEditor } from '../components/SceneEditor';

export function ImagesPage() {
  const { project, setProject, health, reload } = useProject();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const navigate = useNavigate();
  const missingRefs = missingCharacterReferences(project.scenes, project.visualBible);
  const selected = project.scenes.find((s) => s.id === selectedId);
  const generatingCount = project.scenes.filter((s) => s.generationState === 'generating').length;
  const completeCount = project.scenes.filter((s) => s.currentAssetId || s.image).length;

  useEffect(() => {
    if (generatingCount === 0) return;
    const timer = window.setInterval(() => {
      void reload();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [generatingCount, reload]);

  return (
    <div className="page editor-layout">
      <div>
        {missingRefs.length > 0 ? (
          <div className="banner warning">
            Character reference missing: {missingRefs.map((c) => c.name).join(', ')}.{' '}
            <Link to={`/projects/${project.id}/characters`}>Open characters</Link>
          </div>
        ) : null}
        {error ? <div className="banner error">{error}</div> : null}
        {busy || generatingCount > 0 ? (
          <div className="banner">
            Generating stills — {completeCount} of {project.scenes.length} ready
            {generatingCount > 0 ? ` · ${generatingCount} in flight` : ''}
          </div>
        ) : null}
        <div className="row" style={{ marginBottom: 14 }}>
          <button
            className="btn btn-primary"
            disabled={busy || project.scenes.length === 0}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const data = await api.generateMissing(project.id);
                setProject(data.project);
              } catch (err) {
                setError(err instanceof ApiClientError ? err.message : 'Batch generation failed.');
                await reload();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Generating stills…' : 'Generate Missing Images'}
          </button>
          <span className="muted">
            {completeCount} / {project.scenes.length} ready
          </span>
        </div>
        {project.scenes.length === 0 ? (
          <EmptyState
            title="No scenes to illustrate"
            body="Generate a storyboard first. Each scene becomes one still with a camera move."
            action={
              <Link className="btn btn-primary" to={`/projects/${project.id}/storyboard`}>
                Go to storyboard
              </Link>
            }
          />
        ) : (
          <div className="grid-cards">
            {project.scenes.map((scene) => (
              <article className="card" key={scene.id}>
                {scene.image?.publicUrl ? (
                  <img
                    className="card-media"
                    src={scene.image.publicUrl}
                    alt={scene.title}
                    style={{ width: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <div className="card-media" />
                )}
                <div className="card-body">
                  <h3>{scene.title}</h3>
                  <div className="mono faint">
                    {formatClockShort(scene.startTime)} – {formatClockShort(scene.endTime)}
                  </div>
                  <div className="pill">{MOTION_PRESET_LABELS[scene.motion]}</div>
                  <div
                    className={`pill ${scene.generationState === 'failed' ? 'error' : scene.generationState === 'complete' ? 'success' : ''}`}
                  >
                    {GENERATION_STATE_LABELS[scene.generationState]}
                  </div>
                  {scene.generationError ? <p className="muted">{scene.generationError}</p> : null}
                  <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
                    <button
                      className="btn"
                      onClick={async () => {
                        try {
                          const data = await api.generateSceneImage(project.id, scene.id);
                          setProject(data.project);
                        } catch (err) {
                          setError(
                            err instanceof ApiClientError
                              ? err.message
                              : `Scene ${scene.order} could not be generated. The image provider returned an error.`,
                          );
                          await reload();
                        }
                      }}
                    >
                      {scene.generationState === 'failed' ? 'Retry' : scene.image ? 'Regenerate' : 'Generate'}
                    </button>
                    <button className="btn" onClick={() => setSelectedId(scene.id)}>
                      Edit Prompt
                    </button>
                    <button
                      className="btn"
                      onClick={async () => {
                        try {
                          const data = await api.patchScene(project.id, scene.id, { approved: !scene.approved });
                          setProject(data.project, data.health);
                        } catch (err) {
                          setError(err instanceof ApiClientError ? err.message : 'Could not update approval.');
                        }
                      }}
                    >
                      {scene.approved ? 'Approved' : 'Approve'}
                    </button>
                    <label className="btn">
                      Replace Image
                      <input
                        hidden
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (!file) return;
                          try {
                            const data = await api.uploadSceneImage(project.id, scene.id, file);
                            setProject(data.project);
                          } catch (err) {
                            setError(err instanceof ApiClientError ? err.message : 'Could not upload that image.');
                          }
                        }}
                      />
                    </label>
                  </div>
                  {scene.previousAssetIds.length > 0 ? (
                    <div style={{ marginTop: 8 }}>
                      <div className="faint">Previous Versions</div>
                      {scene.previousAssetIds.map((assetId) => (
                        <button
                          key={assetId}
                          className="btn btn-ghost"
                          onClick={async () => {
                            try {
                              const data = await api.restoreSceneImage(project.id, scene.id, assetId);
                              setProject(data.project);
                            } catch (err) {
                              setError(err instanceof ApiClientError ? err.message : 'Could not restore that version.');
                            }
                          }}
                        >
                          Restore {assetId.slice(0, 6)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
        <button
          className="btn btn-primary"
          style={{ marginTop: 18 }}
          disabled={project.scenes.length === 0}
          onClick={() => navigate(`/projects/${project.id}/video`)}
        >
          Continue to video
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
              setSelectedId(null);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
