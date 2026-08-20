import { fal } from '@fal-ai/client';

let configuredKey: string | undefined;

export function ensureFalConfigured(credentials?: string): void {
  const key = credentials?.trim() || process.env.FAL_KEY?.trim();
  if (!key) return;
  if (configuredKey === key) return;
  fal.config({ credentials: key });
  configuredKey = key;
}
