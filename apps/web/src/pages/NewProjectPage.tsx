import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiClientError } from '../lib/api';
import { readAudioDurationInBrowser, formatClockShort, titleFromFilename } from '../lib/time';
import { SongIntake } from '../components/SongIntake';

export function NewProjectPage() {
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number | undefined>();
  const [sunoUrl, setSunoUrl] = useState('');
  const [sunoSelected, setSunoSelected] = useState(false);
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function onFile(next: File) {
    setFile(next);
    setSunoSelected(false);
    setError(null);
    const measured = await readAudioDurationInBrowser(next);
    setDuration(measured);
    if (!titleTouched) setTitle(titleFromFilename(next.name));
  }

  function onSunoSelect() {
    if (!sunoUrl.trim()) return;
    setFile(null);
    setDuration(undefined);
    setSunoSelected(true);
    setError(null);
    if (!titleTouched) setTitle('Untitled song');
  }

  async function start() {
    const hasFile = Boolean(file);
    const hasSuno = sunoSelected && Boolean(sunoUrl.trim());
    if (!hasFile && !hasSuno) return;

    setBusy(true);
    setError(null);
    try {
      const name =
        title.trim() ||
        (hasFile && file ? titleFromFilename(file.name) : 'Untitled song');
      const { project } = await api.createProject({ name, songTitle: name });

      if (hasFile && file) {
        const data = await api.uploadAudio(project.id, file, duration);
        if (!data.durationDetected && duration) {
          await api.setDuration(project.id, duration);
        }
      } else {
        const data = await api.importSunoAudio(project.id, sunoUrl.trim());
        if (data.title && !titleTouched) {
          await api.patchProject(project.id, { name: data.title, songTitle: data.title });
        }
      }

      navigate(`/projects/${project.id}/style`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not start the project.');
    } finally {
      setBusy(false);
    }
  }

  const ready = Boolean(file) || (sunoSelected && Boolean(sunoUrl.trim()));

  return (
    <div className="page intake-page">
      <Link to="/" className="faint">
        ← Projects
      </Link>
      <p className="intake-kicker">New cut</p>
      <h1 className="intake-title">Bring the master.</h1>
      <p className="hero-copy">
        Drop the finished song or paste a Suno link. We read the vocals from the track when the cut starts. The film
        title is taken from the song — you can change it later.
      </p>

      <SongIntake
        busy={busy}
        waitTitle="Opening the project"
        waitStages={
          file
            ? ['Creating the film…', 'Saving the master track…']
            : ['Creating the film…', 'Fetching the song from Suno…', 'Saving the master track…']
        }
        loaded={
          file
            ? {
                label: file.name,
                detail: `${file.name}${duration ? ` · ${formatClockShort(duration)}` : ''}`,
              }
            : undefined
        }
        onFileSelect={onFile}
        sunoUrl={sunoUrl}
        onSunoUrlChange={(url) => {
          setSunoUrl(url);
          setSunoSelected(false);
        }}
        sunoSelected={sunoSelected}
        onSunoSelect={onSunoSelect}
      />

      {ready || title ? (
        <div className="field intake-title-field">
          <label htmlFor="film-title">Film title</label>
          <input
            id="film-title"
            value={title}
            onChange={(e) => {
              setTitleTouched(true);
              setTitle(e.target.value);
            }}
            placeholder="Filled from the song"
          />
        </div>
      ) : null}

      {error ? <div className="banner error">{error}</div> : null}

      <div className="intake-actions">
        <button className="btn btn-primary" disabled={!ready || busy} onClick={() => void start()}>
          {busy ? 'Starting…' : 'Start the cut'}
        </button>
        {!ready ? <p className="faint">Add a song or Suno link to continue.</p> : null}
      </div>
    </div>
  );
}
