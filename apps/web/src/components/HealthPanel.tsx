import { useEffect, useState } from 'react';
import type { ProjectHealth } from '@music-video/shared';

export function HealthPanel({ health }: { health: ProjectHealth }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1080px)');
    setOpen(mq.matches);
    const onChange = (event: MediaQueryListEvent) => setOpen(event.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const statusLabel = health.readyToRender
    ? 'Ready to share'
    : health.blockers.length > 0
      ? `${health.blockers.length} blocker${health.blockers.length === 1 ? '' : 's'}`
      : 'In progress';

  return (
    <details
      className="health-drawer"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="health-drawer-summary">
        <span>Project health</span>
        <span className={`pill ${health.readyToRender ? 'success' : health.blockers.length ? 'warning' : ''}`}>
          {statusLabel}
        </span>
      </summary>
      <div className="health-drawer-body health">
        <dl>
          <dt>Storyboard coverage</dt>
          <dd>{health.storyboardCoveragePercent}%</dd>
          <dt>Images generated</dt>
          <dd>
            {health.imagesGenerated} / {health.imagesTotal}
          </dd>
          <dt>Characters approved</dt>
          <dd>
            {health.charactersApproved} / {health.charactersTotal}
          </dd>
          <dt>Timing conflicts</dt>
          <dd>{health.timingConflicts}</dd>
          <dt>Ready to share</dt>
          <dd>{health.readyToRender ? 'Yes' : 'Not yet'}</dd>
        </dl>
        {health.blockers.length > 0 ? (
          <div className="banner warning">
            {health.blockers.map((b) => (
              <div key={b}>{b}</div>
            ))}
          </div>
        ) : health.readyToRender ? (
          <div className="banner success">This cut is ready to share.</div>
        ) : null}
      </div>
    </details>
  );
}
