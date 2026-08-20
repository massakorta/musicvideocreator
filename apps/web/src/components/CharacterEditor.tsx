import { useEffect, useState } from 'react';
import type { CharacterDefinition } from '@music-video/shared';
import { useProject } from '../hooks/useProject';
import { api, ApiClientError } from '../lib/api';
import { CharacterEditorFields } from './CharacterEditorFields';

export function CharacterEditor({
  character,
  onClose,
  onSaved,
}: {
  character: CharacterDefinition;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { project, setProject } = useProject();
  const [draft, setDraft] = useState(character);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(character);
  }, [character]);

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
    const bible = project.visualBible;
    if (!bible) return;
    setBusy(true);
    setError(null);
    try {
      const characters = bible.characters.map((entry) => (entry.id === character.id ? draft : entry));
      const data = await api.patchBible(project.id, { ...bible, characters });
      setProject(data.project);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not save this character.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sheet-backdrop" onClick={() => (!busy ? onClose() : undefined)}>
      <aside
        className="sheet side-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${character.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-head">
          <h3>{character.name}</h3>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>
        <CharacterEditorFields character={draft} onChange={setDraft} />
        {character.lockedReferenceImage ? (
          <p className="muted" style={{ marginBottom: 12 }}>
            Reference is locked. Unlock to regenerate after editing.
          </p>
        ) : null}
        {error ? <div className="banner error">{error}</div> : null}
        <div className="actions">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save character'}
          </button>
        </div>
      </aside>
    </div>
  );
}
