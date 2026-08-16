import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../hooks/useProject';
import { api, ApiClientError } from '../lib/api';

export function CharactersPage() {
  const { project, setProject } = useProject();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const characters = project.visualBible?.characters ?? [];

  if (!project.visualBibleApproved) {
    return (
      <div className="page">
        <div className="banner warning">Approve the visual bible before generating character references.</div>
      </div>
    );
  }

  return (
    <div className="page">
      <p className="hero-copy">Lock a full-body reference for each major character. Locked sheets are reused for scene stills.</p>
      {error ? <div className="banner error">{error}</div> : null}
      <div className="character-grid">
        {characters.map((character) => (
          <article className="card" key={character.id} style={{ padding: 16 }}>
            <h3>{character.name}</h3>
            <p className="muted">{character.role}</p>
            {character.referenceUrl ? (
              <img className="scene-thumb" src={character.referenceUrl} alt="" style={{ width: '100%', height: 140, objectFit: 'cover' }} />
            ) : (
              <div className="card-media" />
            )}
            {character.lockedReferenceImage ? (
              <div className="pill success">Approved</div>
            ) : (
              <div className="pill warning">Needs approval</div>
            )}
            <div className="row" style={{ marginTop: 12 }}>
              <button
                className="btn"
                disabled={busyId === character.id}
                onClick={async () => {
                  setBusyId(character.id);
                  setError(null);
                  try {
                    const data = await api.characterRef(project.id, character.id, Boolean(character.lockedReferenceImage));
                    setProject(data.project);
                  } catch (err) {
                    setError(err instanceof ApiClientError ? err.message : `Could not generate ${character.name}.`);
                  } finally {
                    setBusyId(null);
                  }
                }}
              >
                {busyId === character.id
                  ? 'Generating…'
                  : character.referenceAssetId
                    ? 'Regenerate'
                    : 'Generate Character Reference'}
              </button>
              {character.referenceAssetId ? (
                <button
                  className="btn btn-primary"
                  onClick={async () => {
                    const data = await api.approveCharacter(project.id, character.id, !character.lockedReferenceImage);
                    setProject(data.project);
                  }}
                >
                  {character.lockedReferenceImage ? 'Unlock' : 'Approve'}
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      <div className="row" style={{ marginTop: 20 }}>
        <button className="btn btn-primary" onClick={() => navigate(`/projects/${project.id}/storyboard`)}>
          Continue to storyboard
        </button>
      </div>
    </div>
  );
}
