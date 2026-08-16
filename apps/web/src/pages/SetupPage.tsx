import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../hooks/useProject';
import { api, ApiClientError } from '../lib/api';
import { useDebouncedCallback } from '../hooks/useDebouncedCallback';
import { formatClockShort, readAudioDurationInBrowser, titleFromFilename } from '../lib/time';
import { SongIntake } from '../components/SongIntake';

export function SetupPage() {
  const { project, setProject, reload, markSave } = useProject();
  const [name, setName] = useState(project.name);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sunoUrl, setSunoUrl] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    setName(project.name);
  }, [project.id, project.name]);

  const autosave = useDebouncedCallback(async (patch: { name?: string }) => {
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
      if (!name.trim() || name === 'Untitled film') {
        const nextName = titleFromFilename(file.name);
        setName(nextName);
        autosave({ name: nextName });
      }
      setMessage(`Uploaded ${file.name}`);
      setSunoUrl('');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Audio upload failed.');
    } finally {
      setBusy(false);
    }
  }

  async function onSunoImport(url: string) {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const data = await api.importSunoAudio(project.id, url);
      setProject(data.project);
      if (data.title && (!name.trim() || name === 'Untitled film')) {
        setName(data.title);
        autosave({ name: data.title });
      }
      setMessage(`Imported ${data.title ?? 'song'} from Suno`);
      setSunoUrl(url);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Suno import failed.');
    } finally {
      setBusy(false);
    }
  }

  const canContinue = Boolean(project.audio);

  return (
    <div className="page">
      <p className="hero-copy">
        The song is the clock. When you generate, we listen to the track and line up scenes to the vocals.
      </p>
      <SongIntake
        busy={busy}
        waitTitle="Importing from Suno"
        waitStages={['Resolving the Suno link…', 'Downloading the MP3…', 'Saving the master track…']}
        loaded={
          project.audio
            ? {
                label: project.audio.filename,
                detail: `${project.audio.filename} · ${formatClockShort(project.durationSeconds)}`,
              }
            : undefined
        }
        onFileSelect={onFile}
        onSunoImport={onSunoImport}
        sunoUrl={sunoUrl}
        onSunoUrlChange={setSunoUrl}
      />
      <div className="field" style={{ marginTop: 18 }}>
        <label>Film title</label>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            autosave({ name: e.target.value });
          }}
        />
      </div>
      {message ? <div className="banner success">{message}</div> : null}
      {error ? <div className="banner error">{error}</div> : null}
      {!canContinue ? <p className="faint">Add a song to unlock the next step.</p> : null}
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
