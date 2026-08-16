import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { VisualBible } from '@music-video/shared';
import { useProject, useSession } from '../hooks/useProject';
import { api, ApiClientError } from '../lib/api';
import { HealthPanel } from '../components/HealthPanel';
import { WaitCard } from '../components/WaitCard';
import { useDebouncedCallback } from '../hooks/useDebouncedCallback';

export function BiblePage() {
  const { project, setProject, health } = useProject();
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoNote, setDemoNote] = useState(false);
  const navigate = useNavigate();
  const bible = project.visualBible;
  const autoStarted = useRef(false);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const data = await api.generateBible(project.id);
      setProject(data.project);
      setDemoNote(data.demo);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Visual bible generation failed.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (autoStarted.current || project.visualBible || !project.styleId) return;
    autoStarted.current = true;
    void generate();
  }, [project.id, project.styleId, project.visualBible]);

  async function saveAndApprove(approved: boolean) {
    if (!bible) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api.patchBible(project.id, { ...bible, approved });
      setProject(data.project);
      if (approved) navigate(`/projects/${project.id}/characters`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not save the visual bible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page bible-layout">
      <div>
        {session.demoMode ? (
          <div className="banner warning">
            Live OpenAI generation is off. The studio will build a demo bible you can still edit and approve.
          </div>
        ) : null}
        {error ? <div className="banner error">{error}</div> : null}
        {demoNote ? (
          <div className="banner">Demo visual bible created. Edit freely — regeneration will not overwrite locked characters.</div>
        ) : null}
        <p className="hero-copy">
          This is the film’s look-book. Generate it, tweak the people, then approve so the storyboard can start.
        </p>
        {busy ? (
          <WaitCard
            title={bible ? 'Rewriting the visual bible' : 'Creating the visual bible'}
            expectedSeconds={35}
            stages={[
              'Reading the lyrics and style…',
              'Casting characters and locations…',
              'Locking colors, clothes, and continuity…',
              'Still writing — long songs take a little longer.',
            ]}
          />
        ) : null}
        <div className="row" style={{ marginBottom: 16 }}>
          <button className="btn btn-primary" onClick={() => void generate()} disabled={busy}>
            {busy ? 'Creating visual bible…' : bible ? 'Regenerate Visual Bible' : 'Generate Visual Bible'}
          </button>
          {bible ? (
            <>
              <button className="btn" disabled={busy} onClick={() => void saveAndApprove(false)}>
                Save Changes
              </button>
              <button className="btn btn-primary" disabled={busy} onClick={() => void saveAndApprove(true)}>
                Approve & Continue
              </button>
            </>
          ) : null}
        </div>
        {busy && !bible ? <div className="skeleton" style={{ height: 180 }} /> : null}
        {bible ? (
          <BibleEditor />
        ) : (
          <p className="muted">
            {project.styleId
              ? 'The studio is writing the visual world from your lyrics and style.'
              : 'Choose a visual style first, then generate the bible.'}
          </p>
        )}
      </div>
      <HealthPanel health={health} />
    </div>
  );
}

function BibleEditor() {
  const { project, setProject, markSave } = useProject();
  const bible = project.visualBible!;
  const autosave = useDebouncedCallback(async (nextBible: VisualBible) => {
    markSave('saving');
    try {
      await api.patchBible(project.id, nextBible);
      markSave('saved');
    } catch {
      markSave('error');
    }
  }, 800);

  function patch(partial: Partial<typeof bible>) {
    const next = { ...bible, ...partial };
    setProject({ ...project, visualBible: next });
    autosave(next);
  }

  return (
    <div className="scene-list">
      <section className="card" style={{ padding: 18 }}>
        <h2>Overall Direction</h2>
        <p className="muted">
          {bible.overallStyle.visualMedium} · {bible.overallStyle.mood}
        </p>
        <p>{bible.overallStyle.renderingStyle}</p>
        <p className="muted">{bible.overallStyle.cameraLanguage}</p>
      </section>
      <section>
        <h2>Characters</h2>
        <div className="character-grid">
          {bible.characters.map((character, index) => (
            <article className="card" key={character.id} style={{ padding: 16 }}>
              <div className="field">
                <label>Name</label>
                <input
                  value={character.name}
                  onChange={(e) => {
                    const characters = bible.characters.map((c, i) => (i === index ? { ...c, name: e.target.value } : c));
                    patch({ characters });
                  }}
                />
              </div>
              <div className="field">
                <label>Face</label>
                <textarea
                  style={{ minHeight: 70 }}
                  value={character.face}
                  onChange={(e) => {
                    const characters = bible.characters.map((c, i) =>
                      i === index ? { ...c, face: e.target.value, promptDescription: e.target.value } : c,
                    );
                    patch({ characters });
                  }}
                />
              </div>
              <div className="field">
                <label>Body</label>
                <input
                  value={character.bodyType}
                  onChange={(e) => {
                    const characters = bible.characters.map((c, i) => (i === index ? { ...c, bodyType: e.target.value } : c));
                    patch({ characters });
                  }}
                />
              </div>
              <div className="field">
                <label>Hair</label>
                <input
                  value={character.hair}
                  onChange={(e) => {
                    const characters = bible.characters.map((c, i) => (i === index ? { ...c, hair: e.target.value } : c));
                    patch({ characters });
                  }}
                />
              </div>
              <div className="field">
                <label>Clothes</label>
                <input
                  value={character.clothing}
                  onChange={(e) => {
                    const characters = bible.characters.map((c, i) => (i === index ? { ...c, clothing: e.target.value } : c));
                    patch({ characters });
                  }}
                />
              </div>
              <div className="field">
                <label>Personality</label>
                <input
                  value={character.personality}
                  onChange={(e) => {
                    const characters = bible.characters.map((c, i) =>
                      i === index ? { ...c, personality: e.target.value } : c,
                    );
                    patch({ characters });
                  }}
                />
              </div>
              {character.lockedReferenceImage ? <span className="pill success">Reference locked</span> : null}
            </article>
          ))}
        </div>
      </section>
      <section className="card" style={{ padding: 18 }}>
        <h2>Locations</h2>
        {bible.environments.map((env) => (
          <div key={env.id} style={{ marginBottom: 12 }}>
            <h3>{env.name}</h3>
            <p className="muted">{env.description}</p>
          </div>
        ))}
      </section>
      <section className="card" style={{ padding: 18 }}>
        <h2>Color Palette</h2>
        <div className="palette">
          {bible.colorPalette.map((color) => (
            <div key={color.name} title={`${color.name}: ${color.usage}`}>
              <div className="swatch" style={{ background: color.hex }} />
              <div className="faint">{color.name}</div>
            </div>
          ))}
        </div>
      </section>
      <section className="card" style={{ padding: 18 }}>
        <h2>Important Props</h2>
        <ul className="list">
          {bible.recurringProps.map((prop) => (
            <li key={prop.id}>
              <strong>{prop.name}</strong> — {prop.description}
            </li>
          ))}
        </ul>
      </section>
      <section className="card" style={{ padding: 18 }}>
        <h2>Continuity Rules</h2>
        <ul className="list">
          {bible.continuityRules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </section>
      <section className="card" style={{ padding: 18 }}>
        <h2>Things to Avoid</h2>
        <ul className="list">
          {bible.negativeRules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
