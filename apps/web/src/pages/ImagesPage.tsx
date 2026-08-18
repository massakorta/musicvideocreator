import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GENERATION_STATE_LABELS, MOTION_PRESET_LABELS, getImageQuality, imagesNeedQualityRegenerate, missingCharacterReferences, effectiveGeneratedImageQualityId, resolveProjectImageQualityId } from '@music-video/shared';
import { useProject } from '../hooks/useProject';
import { api, ApiClientError } from '../lib/api';
import { formatClockShort } from '../lib/time';
import { HealthPanel } from '../components/HealthPanel';
import { EmptyState } from '../components/EmptyState';
import { ImageQualityPicker, imageQualitySecondsPerStill } from '../components/ImageQualityPicker';
import { SceneEditor } from '../components/SceneEditor';
import { CardWaitOverlay, WaitCard } from '../components/WaitCard';
import { mergeProjectFromServer, scenesMissingImages } from '../lib/mergeProject';

const IMAGE_GENERATION_CONCURRENCY = 6;

export function ImagesPage() {
  const { project, setProject, health, reload, stale } = useProject();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [batch, setBatch] = useState({ done: 0, total: 0, title: '' });
  const [singleTitle, setSingleTitle] = useState<string | null>(null);
  const [paintingIds, setPaintingIds] = useState<string[]>([]);
  const [queuedIds, setQueuedIds] = useState<string[]>([]);
  const [regenerating, setRegenerating] = useState(false);
  const navigate = useNavigate();
  const projectRef = useRef(project);
  useEffect(() => {
    projectRef.current = project;
  }, [project]);
  const missingRefs = missingCharacterReferences(project.scenes, project.visualBible);
  const selected = project.scenes.find((s) => s.id === selectedId);
  const generatingCount = project.scenes.filter(
    (s) => s.generationState === 'generating' && !s.currentAssetId && !s.image,
  ).length;
  const completeCount = project.scenes.filter((s) => s.currentAssetId || s.image).length;
  const perStillSeconds = imageQualitySecondsPerStill(project);
  const generationBusy = busy || generatingCount > 0 || Boolean(singleTitle);
  const qualityRegenerateNeeded = imagesNeedQualityRegenerate(project);
  const currentQuality = getImageQuality(resolveProjectImageQualityId(project));
  const generatedQuality = getImageQuality(effectiveGeneratedImageQualityId(project));

  function scenesWithImages() {
    return project.scenes.filter((scene) => scene.currentAssetId || scene.image);
  }

  function applyProjectUpdate(incoming: typeof project) {
    const merged = mergeProjectFromServer(projectRef.current, incoming);
    projectRef.current = merged;
    setProject(merged);
  }

  function sceneIsActivelyPainting(scene: (typeof project.scenes)[number]): boolean {
    return (
      paintingIds.includes(scene.id) ||
      (scene.generationState === 'generating' && !scene.currentAssetId && !scene.image)
    );
  }

  async function generateMissing() {
    const missing = scenesMissingImages(project.scenes);
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
          applyProjectUpdate(data.project);
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
    await Promise.all(
      Array.from({ length: Math.min(IMAGE_GENERATION_CONCURRENCY, missing.length) }, () => worker()),
    );
    await reload();
    if (failures > 0) {
      setError(`${failures} still${failures === 1 ? '' : 's'} failed. Retry those cards, or generate missing again.`);
    }
    setBusy(false);
    setBatch({ done: 0, total: 0, title: '' });
    setPaintingIds([]);
    setQueuedIds([]);
  }

  async function regenerateAllImages() {
    const existing = scenesWithImages();
    if (existing.length === 0) return;
    setBusy(true);
    setError(null);
    setQueuedIds(existing.map((scene) => scene.id));
    setPaintingIds([]);
    setBatch({ done: 0, total: existing.length, title: existing[0]?.title ?? '' });
    let cursor = 0;
    let failures = 0;
    async function worker() {
      while (cursor < existing.length) {
        const index = cursor;
        cursor += 1;
        const scene = existing[index];
        if (!scene) return;
        setQueuedIds((ids) => ids.filter((id) => id !== scene.id));
        setPaintingIds((ids) => [...ids, scene.id]);
        setBatch((current) => ({ ...current, title: scene.title }));
        try {
          const data = await api.generateSceneImage(project.id, scene.id, true);
          applyProjectUpdate(data.project);
        } catch (err) {
          failures += 1;
          setError(
            err instanceof ApiClientError
              ? err.message
              : `Scene ${scene.order} could not be regenerated. The rest will keep going.`,
          );
          await reload();
        } finally {
          setPaintingIds((ids) => ids.filter((id) => id !== scene.id));
        }
        setBatch((current) => ({ ...current, done: current.done + 1 }));
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(IMAGE_GENERATION_CONCURRENCY, existing.length) }, () => worker()),
    );
    await reload();
    if (failures > 0) {
      setError(`${failures} still${failures === 1 ? '' : 's'} failed. Retry those cards, or regenerate again.`);
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
        {qualityRegenerateNeeded ? (
          <div className="banner warning" style={{ marginBottom: 14 }}>
            You changed still quality. Existing stills use {generatedQuality.name}. Regenerate to apply{' '}
            {currentQuality.name}.
          </div>
        ) : null}
        {busy || generatingCount > 0 || singleTitle ? (
          <WaitCard
            title={
              qualityRegenerateNeeded && busy
                ? 'Repainting stills at new quality'
                : singleTitle && !busy
                  ? 'Painting one still'
                  : 'Painting scene stills'
            }
            current={busy ? batch.done : singleTitle ? undefined : completeCount}
            total={busy ? batch.total : singleTitle ? undefined : project.scenes.length}
            expectedSeconds={
              singleTitle && !busy
                ? perStillSeconds
                : Math.max(
                    perStillSeconds,
                    (busy ? batch.total - batch.done : project.scenes.length - completeCount) * perStillSeconds,
                  )
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
            stages={['Each still takes a few seconds. Keep this tab open.']}
          />
        ) : null}
        <ImageQualityPicker
          project={project}
          setProject={setProject}
          disabled={generationBusy}
          variant="compact"
        />
        <div className="actions">
          {qualityRegenerateNeeded ? (
            <button
              className="btn btn-primary"
              disabled={generationBusy || project.scenes.length === 0}
              onClick={() => void regenerateAllImages()}
            >
              {busy ? 'Regenerating stills…' : `Regenerate all at ${currentQuality.name}`}
            </button>
          ) : null}
          {!qualityRegenerateNeeded || completeCount < project.scenes.length ? (
            <button
              className={`btn ${qualityRegenerateNeeded ? '' : 'btn-primary'}`}
              disabled={busy || project.scenes.length === 0 || completeCount === project.scenes.length}
              onClick={() => void generateMissing()}
            >
              {busy && !qualityRegenerateNeeded ? 'Generating stills…' : 'Generate Missing Images'}
            </button>
          ) : null}
          {stale && stale.staleSceneIds.length > 0 ? (
            <button
              className="btn"
              disabled={regenerating}
              onClick={async () => {
                setRegenerating(true);
                setError(null);
                try {
                  await api.regenerateStale(project.id);
                  navigate(`/projects/${project.id}/pipeline`);
                } catch (err) {
                  setError(err instanceof ApiClientError ? err.message : 'Could not queue updates.');
                } finally {
                  setRegenerating(false);
                }
              }}
            >
              {regenerating ? 'Queueing…' : `Uppdatera ändrade bilder (${stale.staleSceneIds.length})`}
            </button>
          ) : null}
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
                  {sceneIsActivelyPainting(scene) ? (
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
                      stale?.staleSceneIds.includes(scene.id)
                        ? 'warning'
                        : scene.generationState === 'failed'
                          ? 'error'
                          : scene.generationState === 'complete' || scene.image
                            ? 'success'
                            : sceneIsActivelyPainting(scene)
                              ? 'warning'
                              : ''
                    }`}
                  >
                    {stale?.staleSceneIds.includes(scene.id)
                      ? 'Inaktuell'
                      : sceneIsActivelyPainting(scene)
                        ? 'Painting'
                        : queuedIds.includes(scene.id)
                          ? 'In queue'
                          : GENERATION_STATE_LABELS[scene.generationState]}
                  </div>
                  {scene.generationError ? <p className="muted">{scene.generationError}</p> : null}
                  <div className="card-actions">
                    <button
                      className="btn btn-primary"
                      disabled={busy || Boolean(singleTitle)}
                      onClick={async () => {
                        setSingleTitle(scene.title);
                        setPaintingIds([scene.id]);
                        setError(null);
                        try {
                          const data = await api.generateSceneImage(
                            project.id,
                            scene.id,
                            Boolean(scene.currentAssetId || scene.image),
                          );
                          applyProjectUpdate(data.project);
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
                    <div className="card-actions-secondary">
                      <button className="btn" onClick={() => setSelectedId(scene.id)}>
                        Edit
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
                    </div>
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
          style={{ marginTop: 18, width: '100%' }}
          disabled={project.scenes.length === 0}
          onClick={() => navigate(`/projects/${project.id}/video`)}
        >
          Continue to video
        </button>
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
              setSelectedId(null);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
