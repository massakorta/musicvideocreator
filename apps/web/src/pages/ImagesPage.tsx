import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MOTION_PRESET_LABELS, missingCharacterReferences } from '@music-video/shared';
import { useProject } from '../hooks/useProject';
import { api, ApiClientError } from '../lib/api';
import { formatClockShort } from '../lib/time';
import { HealthPanel } from '../components/HealthPanel';
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

  return (
    <div className="page editor-layout">
      <div>
        {missingRefs.length > 0 ? (
          <div className="banner warning">Character reference missing: {missingRefs.map((c) => c.name).join(', ')}</div>
        ) : null}
        {error ? <div className="banner error">{error}</div> : null}
        {busy ? (
          <div className="banner">
            Generating scene {Math.min(completeCount + 1, project.scenes.length)} of {project.scenes.length}
          </div>
        ) : null}
        <div className="row" style={{ marginBottom: 14 }}>
          <button
            className="btn btn-primary"
            disabled={busy}
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
            Generate Missing Images
          </button>
          <span className="muted">
            {completeCount} / {project.scenes.length} · {generatingCount} in flight
          </span>
        </div>
        <div className="grid-cards">
          {project.scenes.map((scene) => (
            <article className="card" key={scene.id}>
              {scene.image?.publicUrl ? (
                <img className="card-media" src={scene.image.publicUrl} alt="" style={{ width: '100%', objectFit: 'cover' }} />
              ) : (
                <div className="card-media" />
              )}
              <div className="card-body">
                <h3>{scene.title}</h3>
                <div className="mono faint">
                  {formatClockShort(scene.startTime)} – {formatClockShort(scene.endTime)}
                </div>
                <div className="pill">{MOTION_PRESET_LABELS[scene.motion]}</div>
                <div className={`pill ${scene.generationState === 'failed' ? 'error' : scene.generationState === 'complete' ? 'success' : ''}`}>
                  {scene.generationState}
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
                    {scene.generationState === 'failed' ? 'Retry' : 'Regenerate'}
                  </button>
                  <button className="btn" onClick={() => setSelectedId(scene.id)}>
                    Edit Prompt
                  </button>
                  <button
                    className="btn"
                    onClick={async () => {
                      const data = await api.patchScene(project.id, scene.id, { approved: !scene.approved });
                      setProject(data.project, data.health);
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
                        if (!file) return;
                        const data = await api.uploadSceneImage(project.id, scene.id, file);
                        setProject(data.project);
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
                          const data = await api.restoreSceneImage(project.id, scene.id, assetId);
                          setProject(data.project);
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
        <button className="btn btn-primary" style={{ marginTop: 18 }} onClick={() => navigate(`/projects/${project.id}/video`)}>
          Continue to video
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
              setSelectedId(null);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
