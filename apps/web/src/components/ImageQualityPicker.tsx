import { useState } from 'react';
import {
  IMAGE_QUALITY_PRESETS,
  resolveProjectImageQualityId,
  type ImageQualityId,
  type MusicVideoProject,
  type ProjectHealth,
} from '@music-video/shared';
import { api, ApiClientError } from '../lib/api';

interface ImageQualityPickerProps {
  project: MusicVideoProject;
  setProject: (project: MusicVideoProject, health?: ProjectHealth) => void;
  disabled?: boolean;
  variant: 'cards' | 'compact';
}

export function ImageQualityPicker({ project, setProject, disabled, variant }: ImageQualityPickerProps) {
  const [busyId, setBusyId] = useState<ImageQualityId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedId = resolveProjectImageQualityId(project);

  async function choose(imageQualityId: ImageQualityId) {
    if (imageQualityId === selectedId) return;
    setBusyId(imageQualityId);
    setError(null);
    try {
      const data = await api.patchProject(project.id, { imageQualityId });
      setProject(data.project, data.health);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not save image quality.');
    } finally {
      setBusyId(null);
    }
  }

  if (variant === 'compact') {
    return (
      <div className="image-quality-compact" style={{ marginBottom: 14 }}>
        <div className="image-quality-compact-label">Still quality</div>
        <div className="image-quality-segmented" role="group" aria-label="Image quality">
          {IMAGE_QUALITY_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`image-quality-segment ${selectedId === preset.id ? 'selected' : ''}`}
              disabled={disabled || Boolean(busyId)}
              title={preset.description}
              onClick={() => void choose(preset.id)}
            >
              {busyId === preset.id ? 'Saving…' : preset.name}
            </button>
          ))}
        </div>
        {error ? <p className="muted" style={{ marginTop: 8 }}>{error}</p> : null}
      </div>
    );
  }

  return (
    <section className="image-quality-section">
      <h2 style={{ fontSize: 22, marginBottom: 6 }}>Still quality</h2>
      <p className="muted" style={{ marginBottom: 14 }}>
        Applies to every character sheet and scene still. Higher quality takes longer and costs more.
      </p>
      {error ? <div className="banner error" style={{ marginBottom: 14 }}>{error}</div> : null}
      <div className="style-grid image-quality-grid">
        {IMAGE_QUALITY_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`card style-card image-quality-card ${selectedId === preset.id ? 'selected' : ''}`}
            disabled={disabled || Boolean(busyId)}
            onClick={() => void choose(preset.id)}
          >
            <div
              className="style-swatch"
              style={{
                background: `linear-gradient(135deg, ${preset.accent}, ${preset.secondary} 55%, #14110e)`,
              }}
            />
            <div className="card-body">
              <h3>{preset.name}</h3>
              <p className="muted">{preset.description}</p>
              {busyId === preset.id ? (
                <div className="pill">Saving…</div>
              ) : selectedId === preset.id ? (
                <div className="pill success">Selected</div>
              ) : (
                <div className="pill">Select</div>
              )}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

export function imageQualitySecondsPerStill(project: MusicVideoProject): number {
  return IMAGE_QUALITY_PRESETS.find((preset) => preset.id === resolveProjectImageQualityId(project))
    ?.expectedSecondsPerStill ?? 8;
}
