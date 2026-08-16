import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject, useSession } from '../hooks/useProject';
import { api, ApiClientError } from '../lib/api';
import { HealthPanel } from '../components/HealthPanel';
import { useDebouncedCallback } from '../hooks/useDebouncedCallback';

export function BiblePage() {
  const { project, setProject, health } = useProject();
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoNote, setDemoNote] = useState(false);
  const navigate = useNavigate();
  const bible = project.visualBible;

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

  async function saveAndApprove(approved: boolean) {
    if (!bible) return;
    const data = await api.patchBible(project.id, { ...bible, approved });
    setProject(data.project);
    if (approved) navigate(`/projects/${project.id}/characters`);
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
        {demoNote ? <div className="banner">Demo visual bible created. Edit freely — regeneration will not overwrite locked characters.</div> : null}
        <div className="row" style={{ marginBottom: 16 }}>
          <button className="btn btn-primary" onClick={() => void generate()} disabled={busy}>
            {busy ? 'Creating visual bible…' : bible ? 'Regenerate Visual Bible' : 'Generate Visual Bible'}
          </button>
          {bible ? (
            <>
              <button className="btn" onClick={() => void saveAndApprove(false)}>
                Save Changes
              </button>
              <button className="btn btn-primary" onClick={() => void saveAndApprove(true)}>
                Approve & Continue
              </button>
            </>
          ) : null}
        </div>
        {busy && !bible ? <div className="skeleton" style={{ height: 240 }} /> : null}
        {bible ? <BibleEditor /> : <p className="muted">Generate a visual bible from the lyrics and style.</p>}
      </div>
      <HealthPanel health={health} />
    </div>
  );
}

function BibleEditor() {
  const { project, setProject } = useProject();
  const bible = project.visualBible!;
  const autosave = useDebouncedCallback(async () => {
    if (!project.visualBible) return;
    await api.patchBible(project.id, project.visualBible);
  }, 800);

  function patch(partial: Partial<typeof bible>) {
    setProject({ ...project, visualBible: { ...bible, ...partial } });
    autosave();
  }

  return (
    <div className="scene-list">
      <section className="card" style={{ padding: 18 }}>
        <h2>Overall Direction</h2>
        <p className="muted">{bible.overallStyle.visualMedium} · {bible.overallStyle.mood}</p>
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
                <label>Appearance</label>
                <textarea
                  style={{ minHeight: 80 }}
                  value={`${character.face}. ${character.bodyType}. ${character.hair}`}
                  onChange={(e) => {
                    const characters = bible.characters.map((c, i) =>
                      i === index ? { ...c, face: e.target.value, promptDescription: e.target.value } : c,
                    );
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
                    const characters = bible.characters.map((c, i) => (i === index ? { ...c, personality: e.target.value } : c));
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
