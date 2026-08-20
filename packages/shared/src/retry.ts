export const MAX_IMAGE_ATTEMPTS = 5;
export const MAX_PIPELINE_REQUEUES = 5;
export const MAX_STAGE_ATTEMPTS = 3;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function errorText(error: unknown): string {
  if (error instanceof Error) {
    const record = error as Error & { body?: unknown; details?: string };
    const fromBody = formatProviderBody(record.body);
    if (fromBody) return fromBody;
    const details =
      typeof record.details === 'string' && record.details.trim() ? ` (${record.details})` : '';
    return `${error.message}${details}`;
  }
  if (!error || typeof error !== 'object') return String(error);
  const record = error as {
    message?: string;
    code?: string;
    status?: number;
    error?: { message?: string; code?: string };
    body?: unknown;
  };
  const fromBody = formatProviderBody(record.body);
  if (fromBody) return fromBody;
  const parts = [record.error?.message, record.message, record.error?.code, record.code].filter(Boolean);
  if (parts.length > 0) return parts.join(' ');
  return safeStringify(error);
}

function formatProviderBody(body: unknown): string | undefined {
  if (!body) return undefined;
  if (typeof body === 'string' && body.trim()) return body;
  if (typeof body !== 'object') return String(body);
  const record = body as { detail?: unknown; message?: string; error?: string };
  if (typeof record.message === 'string' && record.message.trim()) return record.message;
  if (typeof record.error === 'string' && record.error.trim()) return record.error;
  if (typeof record.detail === 'string' && record.detail.trim()) return record.detail;
  if (Array.isArray(record.detail)) {
    const messages = record.detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'msg' in item) {
          return String((item as { msg?: unknown }).msg ?? '');
        }
        return '';
      })
      .filter(Boolean);
    if (messages.length > 0) return messages.join('; ');
  }
  return safeStringify(body);
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function isContentPolicyError(error: unknown): boolean {
  return /content.?policy|content checker|flagged by|safety checker|unsafe|nsfw|could not be processed because|safety|moderation|refus(?:ed|al)/i.test(
    errorText(error),
  );
}

/** fal billing lock (TOP_UP) clears after the account is topped up — retry, do not treat as permanent. */
export function isBillingOrQuotaError(error: unknown): boolean {
  const text = errorText(error);
  return (
    /billing|quota|insufficient|credit|top.?up|user is locked|account is locked|locked.*reason/i.test(text) ||
    /reason:\s*top_up/i.test(text)
  );
}

export function isPermanentProviderError(error: unknown): boolean {
  const text = errorText(error);
  if (/api key|unauthorized|incorrect api/i.test(text)) return true;
  const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : undefined;
  return status === 401;
}

export function isRetryableProviderError(error: unknown): boolean {
  if (isPermanentProviderError(error)) return false;
  if (isBillingOrQuotaError(error)) return true;
  const text = errorText(error);
  if (
    /timed out|timeout|ETIMEDOUT|AbortError|ECONNRESET|fetch failed|overloaded|rate.?limit|too many requests|server.?error|try again|temporarily|429|EAI_AGAIN|ENOTFOUND|socket/i.test(
      text,
    )
  ) {
    return true;
  }
  const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : undefined;
  return status === 429 || (typeof status === 'number' && status >= 500);
}

export function providerRetryDelayMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(30_000, 1_200 * 2 ** Math.max(0, attempt));
  return base + Math.floor(random() * 400);
}

export function sanitizeImagePromptForSafety(prompt: string): string {
  const cleaned = prompt
    .replace(/\b(children|child|kids|kid|toddlers|toddler|infants|infant|babies|baby|teenagers|teenager|teens|teen|minors|minor|underage)\b/gi, 'adult')
    .replace(/\byoung (?:boy|girl|child|man|woman)\b/gi, 'adult')
    .replace(/\bblood(y)?\b/gi, 'cartoon paint splatter')
    .replace(/\b(guns?|rifle|pistol|knives|knife|weapons?|sword)\b/gi, 'cartoon prop')
    .replace(/\b(kill(?:ed|ing)?|murder(?:ed|ing)?|death|dying|corpse|dead body)\b/gi, 'comedy tumble')
    .replace(/\b(nude|naked|nsfw|sexy|seductive|erotic)\b/gi, 'fully clothed');
  const suffix =
    'Family-friendly illustrated cartoon. Every person shown is a clearly adult character. No minors, no suggestive content, no realistic violence, no text, letters, captions, labels, or logos.';
  const extra = 'Safe illustrated character design only. Neutral pose, fully clothed, slapstick comedy tone, no celebrity likeness.';
  let next = cleaned.includes(suffix) ? cleaned : `${cleaned}\n${suffix}`;
  if (!next.includes(extra)) next = `${next}\n${extra}`;
  if (next === prompt) {
    next = `${prompt}\nSimplified family-friendly cartoon illustration, slapstick comedy, plain background.`;
  }
  return next;
}

export async function withRetries<T>(
  operation: () => Promise<T>,
  options: {
    attempts?: number;
    retryIf?: (error: unknown) => boolean;
    delayMs?: (attempt: number) => number;
    onRetry?: (error: unknown, attempt: number) => void;
  } = {},
): Promise<T> {
  const attempts = options.attempts ?? MAX_STAGE_ATTEMPTS;
  const retryIf = options.retryIf ?? isRetryableProviderError;
  const delayMs = options.delayMs ?? ((attempt) => providerRetryDelayMs(attempt));
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts - 1 || !retryIf(error)) throw error;
      options.onRetry?.(error, attempt);
      await sleep(delayMs(attempt));
    }
  }
  throw lastError;
}

export function pipelineRequeueCount(error?: string): number {
  const match = error?.match(/^requeue:(\d+)/);
  return match ? Number(match[1]) : 0;
}

export function nextPipelineRequeueMarker(previous?: string): string {
  return `requeue:${pipelineRequeueCount(previous) + 1}`;
}

export function shouldRequeuePipeline(error: unknown, currentRequeues: number): boolean {
  if (currentRequeues >= MAX_PIPELINE_REQUEUES) return false;
  if (isPermanentProviderError(error)) return false;
  return true;
}
