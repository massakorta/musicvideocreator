import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IMAGE_GENERATION_EXPECTED_SECONDS_PER_STILL } from '@music-video/shared';
import { useProject } from '../hooks/useProject';
import { api, ApiClientError } from '../lib/api';
import { EmptyState } from '../components/EmptyState';
import { CardWaitOverlay, WaitCard } from '../components/WaitCard';
import { CharacterEditor } from '../components/CharacterEditor';

export function CharactersPage() {
  const { project, setProject, stale } = useProject();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, name: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const navigate = useNavigate();
  const characters = project.visualBible?.characters ?? [];
  const editingCharacter = characters.find((character) => character.id === editingId);
  const perStillSeconds = IMAGE_GENERATION_EXPECTED_SECONDS_PER_STILL;

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
    const queue = characters.filter((character) => !(character.lockedReferenceImage && character.referenceAssetId));
    setBusyId('all');
    setError(null);
    setProgress({ current: 0, total: queue.length, name: queue[0]?.name ?? '' });
    try {
      let latest = project;
      for (const [index, character] of queue.entries()) {
        setProgress({ current: index, total: queue.length, name: character.name });
        const data = await api.characterRef(project.id, character.id, false);
        latest = data.project;
        setProject(data.project);
        setProgress({ current: index + 1, total: queue.length, name: character.name });
      }
      setProject(latest);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not generate character sheets.');
    } finally {
      setBusyId(null);
      setProgress({ current: 0, total: 0, name: '' });
    }
  }

  async function approveAll() {
    const queue = characters.filter((character) => character.referenceAssetId && !character.lockedReferenceImage);
    if (queue.length === 0) return;
    setBusyId('approve-all');
    setError(null);
    try {
      let latest = project;
      for (const character of queue) {
        const data = await api.approveCharacter(project.id, character.id, true);
        latest = data.project;
        setProject(data.project);
      }
      setProject(latest);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not approve character sheets.');
    } finally {
      setBusyId(null);
    }
  }

  const pendingApprovalCount = characters.filter(
    (character) => character.referenceAssetId && !character.lockedReferenceImage,
  ).length;

  return (
    <div className="page">
      <p className="hero-copy">
        Lock a full-body reference for each major character. Locked sheets keep faces and costumes consistent in later stills.
      </p>
      {error ? <div className="banner error">{error}</div> : null}
      {busyId && busyId !== 'all' ? (
        <WaitCard
          title="Drawing a character sheet"
          expectedSeconds={perStillSeconds}
          detail={`Painting ${characters.find((character) => character.id === busyId)?.name ?? 'this character'}…`}
          stages={['Full-body reference, same face and costume every time…']}
        />
      ) : null}
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
          {busyId === 'all' ? (
            <WaitCard
              title="Drawing character sheets"
              current={progress.current}
              total={progress.total}
              expectedSeconds={Math.max(perStillSeconds, progress.total * perStillSeconds)}
              detail={progress.name ? `Painting ${progress.name}…` : 'Preparing character sheets…'}
              stages={['Painting full-body references…']}
            />
          ) : null}
          <div className="actions">
            <button className="btn btn-primary" disabled={Boolean(busyId)} onClick={() => void generateAll()}>
              {busyId === 'all' ? 'Generating sheets…' : 'Generate all character sheets'}
            </button>
            <button
              className="btn"
              disabled={Boolean(busyId) || pendingApprovalCount === 0}
              onClick={() => void approveAll()}
            >
              {busyId === 'approve-all' ? 'Approving…' : 'Approve all character sheets'}
            </button>
          </div>
          <div className="character-grid">
            {characters.map((character) => (
              <article className="card" key={character.id} style={{ padding: 16 }}>
                <h3>{character.name}</h3>
                <p className="muted">{character.role}</p>
                <div className="card-media" style={{ height: 140 }}>
                  {character.referenceUrl ? (
                    <img src={character.referenceUrl} alt={`${character.name} reference`} />
                  ) : null}
                  {busyId === character.id || (busyId === 'all' && progress.name === character.name) ? (
                    <CardWaitOverlay label="Painting now" ticking />
                  ) : busyId === 'all' && !character.referenceUrl ? (
                    <CardWaitOverlay label="In queue" />
                  ) : null}
                </div>
                {stale?.staleCharacterIds.includes(character.id) ? (
                  <div className="pill warning">Inaktuell</div>
                ) : character.lockedReferenceImage ? (
                  <div className="pill success">Approved</div>
                ) : busyId === character.id || (busyId === 'all' && progress.name === character.name) ? (
                  <div className="pill live">Painting</div>
                ) : (
                  <div className="pill warning">Needs approval</div>
                )}
                <div className="card-actions">
                  <button
                    className="btn"
                    disabled={Boolean(busyId)}
                    onClick={() => setEditingId(character.id)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={Boolean(busyId)}
                    onClick={() => void generateOne(character.id, Boolean(character.lockedReferenceImage))}
                  >
                    {busyId === character.id
                      ? 'Painting…'
                      : character.referenceAssetId
                        ? 'Regenerate'
                        : 'Generate sheet'}
                  </button>
                  {character.referenceAssetId ? (
                    <button
                      className="btn"
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
      {editingCharacter ? (
        <CharacterEditor
          key={editingCharacter.id}
          character={editingCharacter}
          onClose={() => setEditingId(null)}
          onSaved={() => undefined}
        />
      ) : null}
      <button
        className="btn btn-primary"
        style={{ marginTop: 20, width: '100%' }}
        onClick={() => navigate(`/projects/${project.id}/storyboard`)}
      >
        Continue to storyboard
      </button>
    </div>
  );
}
