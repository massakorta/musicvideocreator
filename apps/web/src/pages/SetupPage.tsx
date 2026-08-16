import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../hooks/useProject';
import { api, ApiClientError } from '../lib/api';
import { useDebouncedCallback } from '../hooks/useDebouncedCallback';
import { readAudioDurationInBrowser } from '../lib/time';

export function SetupPage() {
  const { project, setProject, reload } = useProject();
  const [lyrics, setLyrics] = useState(project.lyrics);
  const [name, setName] = useState(project.name);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const navigate = useNavigate();

  const autosave = useDebouncedCallback(async (patch: { name?: string; lyrics?: string }) => {
    const data = await api.patchProject(project.id, patch);
    setProject(data.project, data.health);
  }, 700);

  async function onFile(file: File) {
    setBusy(true);
    setMessage(null);
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
      setMessage(err instanceof ApiClientError ? err.message : 'Audio upload failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <p className="hero-copy">Upload the finished song and paste lyrics. Keep labels like [Chorus] — they guide the storyboard.</p>
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
        className="drop"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) void onFile(file);
        }}
      >
        <p>Drop MP3, WAV, or M4A here</p>
        <input
          type="file"
          accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onFile(file);
          }}
        />
        {project.audio ? (
          <p className="muted">
            {project.audio.filename} · {project.durationSeconds.toFixed(1)}s
          </p>
        ) : null}
        {busy ? <p>Uploading…</p> : null}
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
      {message ? <div className="banner">{message}</div> : null}
      <button
        className="btn btn-primary"
        disabled={!project.audio || !lyrics.trim()}
        onClick={() => navigate(`/projects/${project.id}/style`)}
      >
        Continue to visual style
      </button>
    </div>
  );
}
