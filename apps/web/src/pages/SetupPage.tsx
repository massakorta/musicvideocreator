import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../hooks/useProject';
import { api, ApiClientError } from '../lib/api';
import { useDebouncedCallback } from '../hooks/useDebouncedCallback';
import { readAudioDurationInBrowser } from '../lib/time';
import { WaitCard } from '../components/WaitCard';

export function SetupPage() {
  const { project, setProject, reload, markSave } = useProject();
  const [lyrics, setLyrics] = useState(project.lyrics);
  const [name, setName] = useState(project.name);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    setLyrics(project.lyrics);
    setName(project.name);
  }, [project.id, project.lyrics, project.name]);

  const autosave = useDebouncedCallback(async (patch: { name?: string; lyrics?: string }) => {
    markSave('saving');
    try {
      const data = await api.patchProject(project.id, patch);
      setProject(data.project, data.health);
    } catch {
      markSave('error');
    }
  }, 700);

  async function onFile(file: File) {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const browserDuration = await readAudioDurationInBrowser(file);
      const data = await api.uploadAudio(project.id, file, browserDuration);
      setProject(data.project);
      if (!data.durationDetected && browserDuration) {
        await api.setDuration(project.id, browserDuration);
        await reload();
      }
      setMessage(`Uploaded ${file.name}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Audio upload failed.');
    } finally {
      setBusy(false);
    }
  }

  const canContinue = Boolean(project.audio && lyrics.trim());

  return (
    <div className="page">
      <p className="hero-copy">
        Drop the finished song and paste lyrics. Keep labels like [Chorus] — they tell the storyboard where the pictures should turn.
      </p>
      <div className="field">
        <label>Project name</label>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            autosave({ name: e.target.value });
          }}
        />
      </div>
      <div
        className={`drop ${dragOver ? 'dragover' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) void onFile(file);
        }}
      >
        <p>{project.audio ? 'Replace the song' : 'Drop MP3, WAV, or M4A here'}</p>
        <label className="btn">
          Choose audio file
          <input
            hidden
            type="file"
            accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void onFile(file);
            }}
          />
        </label>
        {project.audio ? (
          <p className="muted">
            {project.audio.filename} · {project.durationSeconds.toFixed(1)}s
          </p>
        ) : null}
        {busy ? (
          <WaitCard
            title="Uploading the song"
            expectedSeconds={12}
            stages={['Reading the file…', 'Measuring duration…', 'Saving the master track…']}
          />
        ) : null}
      </div>
      <div className="field" style={{ marginTop: 18 }}>
        <label>Lyrics</label>
        <textarea
          value={lyrics}
          onChange={(e) => {
            setLyrics(e.target.value);
            autosave({ lyrics: e.target.value });
          }}
          placeholder={'[Intro]\n…\n[Verse 1]\n…'}
        />
      </div>
      {message ? <div className="banner success">{message}</div> : null}
      {error ? <div className="banner error">{error}</div> : null}
      {!canContinue ? (
        <p className="faint">Add a song and lyrics to unlock the next step.</p>
      ) : null}
      <button
        className="btn btn-primary"
        disabled={!canContinue}
        onClick={() => navigate(`/projects/${project.id}/style`)}
      >
        Continue to visual style
      </button>
    </div>
  );
}
