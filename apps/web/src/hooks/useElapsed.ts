import { useEffect, useState } from 'react';

export function useElapsed(active: boolean): number {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    setSeconds(0);
    const started = Date.now();
    const timer = window.setInterval(() => {
      setSeconds(Math.floor((Date.now() - started) / 1000));
    }, 250);
    return () => window.clearInterval(timer);
  }, [active]);

  return seconds;
}

export function formatElapsed(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

export function estimateRemaining(elapsedSeconds: number, completed: number, total: number, fallbackSeconds: number): number {
  if (total <= 0) return fallbackSeconds;
  if (completed <= 0) return Math.max(8, fallbackSeconds);
  const average = elapsedSeconds / completed;
  return Math.max(0, Math.round(average * (total - completed)));
}

export function pickStage(elapsedSeconds: number, stages: string[]): string {
  if (stages.length === 0) return '';
  const index = Math.min(stages.length - 1, Math.floor(elapsedSeconds / 8));
  return stages[index] ?? stages[0]!;
}
