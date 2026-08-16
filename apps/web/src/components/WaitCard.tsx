import { estimateRemaining, formatElapsed, pickStage, useElapsed } from '../hooks/useElapsed';

export function WaitCard({
  title,
  stages,
  current,
  total,
  detail,
  expectedSeconds = 30,
}: {
  title: string;
  stages: string[];
  current?: number;
  total?: number;
  detail?: string;
  expectedSeconds?: number;
}) {
  const elapsed = useElapsed(true);
  const hasCount = typeof current === 'number' && typeof total === 'number' && total > 0;
  const percent = hasCount ? Math.min(100, Math.round((current / total) * 100)) : Math.min(92, Math.round((elapsed / expectedSeconds) * 100));
  const remaining = hasCount
    ? estimateRemaining(elapsed, current, total, expectedSeconds)
    : Math.max(0, expectedSeconds - elapsed);
  const stage = detail || pickStage(elapsed, stages);

  return (
    <div className="wait-card" role="status" aria-live="polite">
      <div className="wait-card-top">
        <div>
          <div className="wait-kicker">Working</div>
          <h2>{title}</h2>
        </div>
        <div className="wait-clock mono">{formatElapsed(elapsed)}</div>
      </div>
      <p className="wait-stage">{stage}</p>
      <div className="progress wait-progress" aria-label={hasCount ? `${current} of ${total}` : 'Generation progress'}>
        <span style={{ width: `${percent}%` }} />
      </div>
      <div className="wait-meta">
        {hasCount ? (
          <span>
            {current} of {total} · {percent}%
          </span>
        ) : (
          <span>Usually about {expectedSeconds < 75 ? `${expectedSeconds} seconds` : `${Math.ceil(expectedSeconds / 60)} min`}</span>
        )}
        <span>{remaining > 0 ? `About ${formatWaitHint(remaining)} left` : 'Finishing up…'}</span>
      </div>
    </div>
  );
}

function formatWaitHint(seconds: number): string {
  if (seconds < 15) return 'a few seconds';
  if (seconds < 55) return `${Math.round(seconds / 5) * 5} seconds`;
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}
