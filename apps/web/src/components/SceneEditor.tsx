import { useEffect, useState } from 'react';
import {
  MOTION_PRESETS,
  MOTION_PRESET_LABELS,
  normalizeMotionPreset,
  TRANSITION_PRESETS,
  TRANSITION_PRESET_LABELS,
  type StoryboardScene,
} from '@music-video/shared';
import { useProject } from '../hooks/useProject';
import { api, ApiClientError } from '../lib/api';

type SafeCopyTarget = 'description' | 'imagePrompt' | 'all';

function SceneEditorForm({
  scene,
  draft,
  setDraft,
  busy,
  safeCopyTarget,
  error,
  onClose,
  onSave,
  onRegenerate,
  onUpload,
  onDelete,
  onMakeSafer,
}: {
  scene: StoryboardScene;
  draft: StoryboardScene;
  setDraft: (next: StoryboardScene) => void;
  busy: boolean;
  safeCopyTarget: SafeCopyTarget | null;
  error: string | null;
  onClose: () => void;
  onSave: () => void;
  onRegenerate: () => void;
  onUpload: (file: File) => void;
  onDelete: () => void;
  onMakeSafer: (target: SafeCopyTarget) => void;
}) {
  const safeCopyBusy = safeCopyTarget !== null;

  return (
    <>
      <div className="sheet-head">
        <h3>Scene {scene.order}</h3>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="actions" style={{ marginBottom: 12 }}>
        <button
          type="button"
          className="btn"
          disabled={busy || safeCopyBusy}
          onClick={() => onMakeSafer('all')}
        >
          {safeCopyTarget === 'all' ? 'Making safer…' : 'Make all safer for images'}
        </button>
      </div>
      <div className="field">
        <label>Title</label>
        <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
      </div>
      <div className="field">
        <label>Start time</label>
        <input
          type="number"
          step="0.05"
          value={draft.startTime}
          onChange={(e) => setDraft({ ...draft, startTime: Number(e.target.value) })}
        />
      </div>
      <div className="field">
        <label>End time</label>
        <input
          type="number"
          step="0.05"
          value={draft.endTime}
          onChange={(e) => setDraft({ ...draft, endTime: Number(e.target.value) })}
        />
      </div>
      <div className="field">
        <label>Lyrics excerpt</label>
        <textarea
          style={{ minHeight: 70 }}
          value={draft.lyricsExcerpt ?? ''}
          onChange={(e) => setDraft({ ...draft, lyricsExcerpt: e.target.value })}
        />
      </div>
      <div className="field">
        <div className="field-head">
          <label>Scene description</label>
          <button
            type="button"
            className="btn btn-ghost field-action"
            disabled={busy || safeCopyBusy}
            onClick={() => onMakeSafer('description')}
          >
            {safeCopyTarget === 'description' ? 'Making safer…' : 'Make safer'}
          </button>
        </div>
        <p className="muted field-hint">Also rewrites action and visual gag used when building the image prompt.</p>
        <textarea
          style={{ minHeight: 90 }}
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
      </div>
      <div className="field">
        <div className="field-head">
          <label>Image prompt</label>
          <button
            type="button"
            className="btn btn-ghost field-action"
            disabled={busy || safeCopyBusy}
            onClick={() => onMakeSafer('imagePrompt')}
          >
            {safeCopyTarget === 'imagePrompt' ? 'Making safer…' : 'Make safer'}
          </button>
        </div>
        <textarea
          style={{ minHeight: 90 }}
          value={draft.imagePrompt}
          onChange={(e) => setDraft({ ...draft, imagePrompt: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Motion</label>
        <select value={draft.motion} onChange={(e) => setDraft({ ...draft, motion: e.target.value as typeof draft.motion })}>
          {MOTION_PRESETS.map((id) => (
            <option key={id} value={id}>
              {MOTION_PRESET_LABELS[id]}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Transition in</label>
        <select
          value={draft.transitionIn}
          onChange={(e) => setDraft({ ...draft, transitionIn: e.target.value as typeof draft.transitionIn })}
        >
          {TRANSITION_PRESETS.map((id) => (
            <option key={id} value={id}>
              {TRANSITION_PRESET_LABELS[id]}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Transition out</label>
        <select
          value={draft.transitionOut}
          onChange={(e) => setDraft({ ...draft, transitionOut: e.target.value as typeof draft.transitionOut })}
        >
          {TRANSITION_PRESETS.map((id) => (
            <option key={id} value={id}>
              {TRANSITION_PRESET_LABELS[id]}
            </option>
          ))}
        </select>
      </div>
      {error ? <div className="banner error">{error}</div> : null}
      <div className="actions">
        <button type="button" className="btn btn-primary" disabled={busy || safeCopyBusy} onClick={onSave}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <div className="actions-split">
          <button type="button" className="btn" disabled={busy || safeCopyBusy} onClick={onRegenerate}>
            Regenerate Image
          </button>
          <label className="btn">
            Upload
            <input
              type="file"
              accept="image/*"
              hidden
              disabled={busy || safeCopyBusy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUpload(file);
              }}
            />
          </label>
        </div>
        <button type="button" className="btn btn-danger" disabled={busy || safeCopyBusy} onClick={onDelete}>
          Delete Scene
        </button>
      </div>
    </>
  );
}

export function SceneEditor({
  scene,
  onClose,
  onSaved,
}: {
  scene: StoryboardScene;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { project } = useProject();
  const [draft, setDraft] = useState(scene);
  const [busy, setBusy] = useState(false);
  const [safeCopyTarget, setSafeCopyTarget] = useState<SafeCopyTarget | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft({
      ...scene,
      motion: normalizeMotionPreset(scene.motion),
      suggestedMotion: normalizeMotionPreset(scene.suggestedMotion),
    });
  }, [scene]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy && !safeCopyTarget) onClose();
    };
    window.addEventListener('keydown', onKey);
    const mobile = window.matchMedia('(max-width: 1079px)');
    if (mobile.matches) document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [busy, onClose, safeCopyTarget]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.patchScene(project.id, scene.id, {
        title: draft.title,
        startTime: Number(draft.startTime),
        endTime: Number(draft.endTime),
        lyricsExcerpt: draft.lyricsExcerpt,
        description: draft.description,
        action: draft.action,
        visualComedy: draft.visualComedy,
        imagePrompt: draft.imagePrompt,
        motion: draft.motion,
        transitionIn: draft.transitionIn,
        transitionOut: draft.transitionOut,
        characters: draft.characters,
        environmentId: draft.environmentId,
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this scene.');
    } finally {
      setBusy(false);
    }
  }

  async function makeSafer(target: SafeCopyTarget) {
    setSafeCopyTarget(target);
    setError(null);
    try {
      const result = await api.generateSafeSceneCopy(project.id, scene.id, target);
      setDraft((current) => ({
        ...current,
        description: result.description,
        action: result.action,
        imagePrompt: result.imagePrompt,
        visualComedy: result.visualComedy ?? current.visualComedy,
      }));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not rewrite this scene for safer image generation.');
    } finally {
      setSafeCopyTarget(null);
    }
  }

  async function regenerate() {
    setBusy(true);
    setError(null);
    try {
      await api.generateSceneImage(project.id, scene.id, true);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not regenerate this still.');
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    await api.uploadSceneImage(project.id, scene.id, file);
    await onSaved();
  }

  async function remove() {
    await api.deleteScene(project.id, scene.id);
    await onSaved();
    onClose();
  }

  const formProps = {
    scene,
    draft,
    setDraft,
    busy,
    safeCopyTarget,
    error,
    onClose,
    onSave: () => void save(),
    onRegenerate: () => void regenerate(),
    onUpload: (file: File) => void upload(file),
    onDelete: () => void remove(),
    onMakeSafer: (target: SafeCopyTarget) => void makeSafer(target),
  };

  return (
    <div className="sheet-backdrop sheet-backdrop-modal" onClick={() => (!busy && !safeCopyTarget ? onClose() : undefined)}>
      <aside
        className="sheet side-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Edit scene ${scene.order}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <SceneEditorForm {...formProps} />
      </aside>
    </div>
  );
}
