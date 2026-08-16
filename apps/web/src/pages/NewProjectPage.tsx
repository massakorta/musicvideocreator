import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiClientError } from '../lib/api';
import { formatClockShort, readAudioDurationInBrowser, titleFromFilename } from '../lib/time';
import { WaitCard } from '../components/WaitCard';

export function NewProjectPage() {
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number | undefined>();
  const [lyrics, setLyrics] = useState('');
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function onFile(next: File) {
    setFile(next);
    setError(null);
    const measured = await readAudioDurationInBrowser(next);
    setDuration(measured);
    if (!titleTouched) setTitle(titleFromFilename(next.name));
  }

  async function start() {
    if (!file || !lyrics.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const name = title.trim() || titleFromFilename(file.name);
      const { project } = await api.createProject({ name, songTitle: name, lyrics: lyrics.trim() });
      const data = await api.uploadAudio(project.id, file, duration);
      if (!data.durationDetected && duration) {
        await api.setDuration(project.id, duration);
      }
      navigate(`/projects/${project.id}/style`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not start the project.');
    } finally {
      setBusy(false);
    }
  }

  const ready = Boolean(file && lyrics.trim());

  return (
    <div className="page intake-page">
      <Link to="/" className="faint">
        ← Projects
      </Link>
      <p className="intake-kicker">New cut</p>
      <h1 className="intake-title">Bring the master.</h1>
      <p className="hero-copy">
        Drop the finished song and paste the lyrics. The film title is taken from the file — you can change it later.
      </p>

      <div className="intake-desk">
        <div
          className={`intake-well ${dragOver ? 'dragover' : ''} ${file ? 'ready' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const next = e.dataTransfer.files[0];
            if (next) void onFile(next);
          }}
        >
          <div className={`intake-disc ${file ? 'ready' : ''}`} aria-hidden="true" />
          <div>
            <strong>{file ? 'Master loaded' : 'The song'}</strong>
            <p className="muted">
              {file
                ? `${file.name}${duration ? ` · ${formatClockShort(duration)}` : ''}`
                : 'Drop an MP3, WAV, or M4A. This track is the clock for the cut.'}
            </p>
          </div>
          <label className="btn">
            {file ? 'Replace song' : 'Choose audio file'}
            <input
              hidden
              type="file"
              accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4"
              onChange={(e) => {
                const next = e.target.files?.[0];
                e.target.value = '';
                if (next) void onFile(next);
              }}
            />
          </label>
        </div>

        <div className="intake-script">
          <label htmlFor="lyrics">The lyrics</label>
          <textarea
            id="lyrics"
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
            placeholder={'[Intro]\n…\n[Verse 1]\n…\n[Chorus]\n…'}
          />
          <p className="faint">Keep labels like [Chorus]. They tell the storyboard where the pictures should turn.</p>
        </div>
      </div>

      {file || title ? (
        <div className="field intake-title-field">
          <label htmlFor="film-title">Film title</label>
          <input
            id="film-title"
            value={title}
            onChange={(e) => {
              setTitleTouched(true);
              setTitle(e.target.value);
            }}
            placeholder="Filled from the song file"
          />
        </div>
      ) : null}

      {error ? <div className="banner error">{error}</div> : null}
      {busy ? (
        <WaitCard
          title="Opening the project"
          expectedSeconds={10}
          stages={['Creating the film…', 'Saving the master track…']}
        />
      ) : null}

      <div className="intake-actions">
        <button className="btn btn-primary" disabled={!ready || busy} onClick={() => void start()}>
          {busy ? 'Starting…' : 'Start the cut'}
        </button>
        {!ready ? <p className="faint">Add a song and lyrics to continue.</p> : null}
      </div>
    </div>
  );
}
