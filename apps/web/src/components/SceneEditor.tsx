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
import { api } from '../lib/api';

function SceneEditorForm({
  scene,
  draft,
  setDraft,
  busy,
  error,
  onClose,
  onSave,
  onRegenerate,
  onUpload,
  onDelete,
}: {
  scene: StoryboardScene;
  draft: StoryboardScene;
  setDraft: (next: StoryboardScene) => void;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: () => void;
  onRegenerate: () => void;
  onUpload: (file: File) => void;
  onDelete: () => void;
}) {
  return (
    <>
      <div className="sheet-head">
        <h3>Scene {scene.order}</h3>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Close
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
        <label>Scene description</label>
        <textarea
          style={{ minHeight: 90 }}
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Image prompt</label>
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
        <button type="button" className="btn btn-primary" disabled={busy} onClick={onSave}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <div className="actions-split">
          <button type="button" className="btn" disabled={busy} onClick={onRegenerate}>
            Regenerate Image
          </button>
          <label className="btn">
            Upload
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUpload(file);
              }}
            />
          </label>
        </div>
        <button type="button" className="btn btn-danger" disabled={busy} onClick={onDelete}>
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
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    const mobile = window.matchMedia('(max-width: 1079px)');
    if (mobile.matches) document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [busy, onClose]);

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
    error,
    onClose,
    onSave: () => void save(),
    onRegenerate: () => void regenerate(),
    onUpload: (file: File) => void upload(file),
    onDelete: () => void remove(),
  };

  return (
    <div className="sheet-backdrop" onClick={() => (!busy ? onClose() : undefined)}>
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
