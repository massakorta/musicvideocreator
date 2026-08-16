import type { ProjectHealth } from '@music-video/shared';

export function HealthPanel({ health }: { health: ProjectHealth }) {
  return (
    <aside className="side-panel health">
      <h3 style={{ marginBottom: 12 }}>Project health</h3>
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
        <dt>Ready to render</dt>
        <dd>{health.readyToRender ? 'Yes' : 'Not yet'}</dd>
      </dl>
      {health.blockers.length > 0 ? (
        <div className="banner warning">
          {health.blockers.map((b) => (
            <div key={b}>{b}</div>
          ))}
        </div>
      ) : health.readyToRender ? (
        <div className="banner success">This cut is ready to render.</div>
      ) : null}
    </aside>
  );
}
