import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useProject } from '../hooks/useProject';
import { api, ApiClientError } from '../lib/api';
import { EmptyState } from '../components/EmptyState';

export function CharactersPage() {
  const { project, setProject } = useProject();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const characters = project.visualBible?.characters ?? [];

  if (!project.visualBibleApproved) {
    return (
      <div className="page">
        <EmptyState
          title="Approve the visual bible first"
          body="Character sheets stay locked to the look-book. Generate and approve the bible, then come back here."
          action={
            <Link className="btn btn-primary" to={`/projects/${project.id}/bible`}>
              Go to visual bible
            </Link>
          }
        />
      </div>
    );
  }

  async function generateOne(characterId: string, force: boolean) {
    setBusyId(characterId);
    setError(null);
    try {
      const data = await api.characterRef(project.id, characterId, force);
      setProject(data.project);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not generate that character.');
    } finally {
      setBusyId(null);
    }
  }

  async function generateAll() {
    setBusyId('all');
    setError(null);
    try {
      let latest = project;
      for (const character of characters) {
        if (character.lockedReferenceImage && character.referenceAssetId) continue;
        const data = await api.characterRef(project.id, character.id, false);
        latest = data.project;
        setProject(data.project);
      }
      setProject(latest);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not generate character sheets.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page">
      <p className="hero-copy">
        Lock a full-body reference for each major character. Locked sheets keep faces and costumes consistent in later stills.
      </p>
      {error ? <div className="banner error">{error}</div> : null}
      {characters.length === 0 ? (
        <EmptyState
          title="No characters in this bible"
          body="This look-book has no people to sheet. Continue to the storyboard, or regenerate the bible."
          action={
            <button className="btn btn-primary" onClick={() => navigate(`/projects/${project.id}/storyboard`)}>
              Continue to storyboard
            </button>
          }
        />
      ) : (
        <>
          <div className="row" style={{ marginBottom: 16 }}>
            <button className="btn btn-primary" disabled={Boolean(busyId)} onClick={() => void generateAll()}>
              {busyId === 'all' ? 'Generating sheets…' : 'Generate all character sheets'}
            </button>
          </div>
          <div className="character-grid">
            {characters.map((character) => (
              <article className="card" key={character.id} style={{ padding: 16 }}>
                <h3>{character.name}</h3>
                <p className="muted">{character.role}</p>
                {character.referenceUrl ? (
                  <img
                    className="scene-thumb"
                    src={character.referenceUrl}
                    alt={`${character.name} reference`}
                    style={{ width: '100%', height: 140, objectFit: 'cover' }}
                  />
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
                    disabled={Boolean(busyId)}
                    onClick={() => void generateOne(character.id, Boolean(character.lockedReferenceImage))}
                  >
                    {busyId === character.id
                      ? 'Generating…'
                      : character.referenceAssetId
                        ? 'Regenerate'
                        : 'Generate sheet'}
                  </button>
                  {character.referenceAssetId ? (
                    <button
                      className="btn btn-primary"
                      onClick={async () => {
                        try {
                          const data = await api.approveCharacter(
                            project.id,
                            character.id,
                            !character.lockedReferenceImage,
                          );
                          setProject(data.project);
                        } catch (err) {
                          setError(err instanceof ApiClientError ? err.message : 'Could not update approval.');
                        }
                      }}
                    >
                      {character.lockedReferenceImage ? 'Unlock' : 'Approve'}
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      <div className="row" style={{ marginTop: 20 }}>
        <button className="btn btn-primary" onClick={() => navigate(`/projects/${project.id}/storyboard`)}>
          Continue to storyboard
        </button>
      </div>
    </div>
  );
}
