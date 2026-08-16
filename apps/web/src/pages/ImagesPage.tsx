import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GENERATION_STATE_LABELS, MOTION_PRESET_LABELS, missingCharacterReferences } from '@music-video/shared';
import { useProject } from '../hooks/useProject';
import { api, ApiClientError } from '../lib/api';
import { formatClockShort } from '../lib/time';
import { HealthPanel } from '../components/HealthPanel';
import { EmptyState } from '../components/EmptyState';
import { SceneEditor } from '../components/SceneEditor';
import { CardWaitOverlay, WaitCard } from '../components/WaitCard';

export function ImagesPage() {
  const { project, setProject, health, reload } = useProject();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [batch, setBatch] = useState({ done: 0, total: 0, title: '' });
  const [singleTitle, setSingleTitle] = useState<string | null>(null);
  const [paintingIds, setPaintingIds] = useState<string[]>([]);
  const [queuedIds, setQueuedIds] = useState<string[]>([]);
  const navigate = useNavigate();
  const missingRefs = missingCharacterReferences(project.scenes, project.visualBible);
  const selected = project.scenes.find((s) => s.id === selectedId);
  const generatingCount = project.scenes.filter((s) => s.generationState === 'generating').length;
  const completeCount = project.scenes.filter((s) => s.currentAssetId || s.image).length;

  async function generateMissing() {
    const missing = project.scenes.filter((scene) => !scene.approved && !scene.currentAssetId && scene.generationState !== 'generating');
    if (missing.length === 0) return;
    setBusy(true);
    setError(null);
    setQueuedIds(missing.map((scene) => scene.id));
    setPaintingIds([]);
    setBatch({ done: 0, total: missing.length, title: missing[0]?.title ?? '' });
    let cursor = 0;
    let failures = 0;
    async function worker() {
      while (cursor < missing.length) {
        const index = cursor;
        cursor += 1;
        const scene = missing[index];
        if (!scene) return;
        setQueuedIds((ids) => ids.filter((id) => id !== scene.id));
        setPaintingIds((ids) => [...ids, scene.id]);
        setBatch((current) => ({ ...current, title: scene.title }));
        try {
          const data = await api.generateSceneImage(project.id, scene.id);
          setProject(data.project);
        } catch (err) {
          failures += 1;
          setError(
            err instanceof ApiClientError
              ? err.message
              : `Scene ${scene.order} could not be generated. The rest will keep going.`,
          );
          await reload();
        } finally {
          setPaintingIds((ids) => ids.filter((id) => id !== scene.id));
        }
        setBatch((current) => ({ ...current, done: current.done + 1 }));
      }
    }
    await Promise.all(Array.from({ length: Math.min(2, missing.length) }, () => worker()));
    await reload();
    if (failures > 0) {
      setError(`${failures} still${failures === 1 ? '' : 's'} failed. Retry those cards, or generate missing again.`);
    }
    setBusy(false);
    setBatch({ done: 0, total: 0, title: '' });
    setPaintingIds([]);
    setQueuedIds([]);
  }

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
        {busy || generatingCount > 0 || singleTitle ? (
          <WaitCard
            title={singleTitle && !busy ? 'Painting one still' : 'Painting scene stills'}
            current={busy ? batch.done : singleTitle ? undefined : completeCount}
            total={busy ? batch.total : singleTitle ? undefined : project.scenes.length}
            expectedSeconds={
              singleTitle && !busy
                ? 40
                : Math.max(40, (busy ? batch.total - batch.done : project.scenes.length - completeCount) * 25)
            }
            detail={
              batch.title
                ? `Painting “${batch.title}”…`
                : singleTitle
                  ? `Painting “${singleTitle}”…`
                  : generatingCount > 0
                    ? `${generatingCount} stills in flight`
                    : 'Starting the first still…'
            }
            stages={['Each still takes about 20–40 seconds. Keep this tab open.']}
          />
        ) : null}
        <div className="row" style={{ marginBottom: 14 }}>
          <button
            className="btn btn-primary"
            disabled={busy || project.scenes.length === 0 || completeCount === project.scenes.length}
            onClick={() => void generateMissing()}
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
                <div className="card-media">
                  {scene.image?.publicUrl ? (
                    <img src={scene.image.publicUrl} alt={scene.title} />
                  ) : null}
                  {paintingIds.includes(scene.id) || scene.generationState === 'generating' ? (
                    <CardWaitOverlay label="Painting now" ticking />
                  ) : queuedIds.includes(scene.id) ? (
                    <CardWaitOverlay label="In queue" />
                  ) : null}
                </div>
                <div className="card-body">
                  <h3>{scene.title}</h3>
                  <div className="mono faint">
                    {formatClockShort(scene.startTime)} – {formatClockShort(scene.endTime)}
                  </div>
                  <div className="pill">{MOTION_PRESET_LABELS[scene.motion]}</div>
                  <div
                    className={`pill ${
                      scene.generationState === 'failed'
                        ? 'error'
                        : scene.generationState === 'complete' || scene.image
                          ? 'success'
                          : paintingIds.includes(scene.id) || scene.generationState === 'generating'
                            ? 'warning'
                            : ''
                    }`}
                  >
                    {paintingIds.includes(scene.id) || scene.generationState === 'generating'
                      ? 'Painting'
                      : queuedIds.includes(scene.id)
                        ? 'In queue'
                        : GENERATION_STATE_LABELS[scene.generationState]}
                  </div>
                  {scene.generationError ? <p className="muted">{scene.generationError}</p> : null}
                  <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
                    <button
                      className="btn"
                      disabled={busy || Boolean(singleTitle)}
                      onClick={async () => {
                        setSingleTitle(scene.title);
                        setPaintingIds([scene.id]);
                        setError(null);
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
                        } finally {
                          setSingleTitle(null);
                          setPaintingIds([]);
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
