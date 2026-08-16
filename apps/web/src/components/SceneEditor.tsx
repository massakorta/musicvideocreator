import { useState } from 'react';
import {
  MOTION_PRESETS,
  MOTION_PRESET_LABELS,
  TRANSITION_PRESETS,
  TRANSITION_PRESET_LABELS,
  type StoryboardScene,
} from '@music-video/shared';
import { useProject } from '../hooks/useProject';
import { api } from '../lib/api';

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

  return (
    <aside className="side-panel" style={{ marginTop: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3>Scene {scene.order}</h3>
        <button className="btn btn-ghost" onClick={onClose}>
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
      <div className="row">
        <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          className="btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await api.generateSceneImage(project.id, scene.id);
              await onSaved();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not regenerate this still.');
            } finally {
              setBusy(false);
            }
          }}
        >
          Regenerate Image
        </button>
      </div>
      <label className="btn" style={{ marginTop: 8 }}>
        Upload Replacement
        <input
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            await api.uploadSceneImage(project.id, scene.id, file);
            await onSaved();
          }}
        />
      </label>
      <button
        className="btn btn-danger"
        style={{ marginTop: 8 }}
        onClick={async () => {
          await api.deleteScene(project.id, scene.id);
          await onSaved();
          onClose();
        }}
      >
        Delete Scene
      </button>
    </aside>
  );
}
