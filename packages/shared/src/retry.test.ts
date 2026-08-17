import { describe, expect, it, vi } from 'vitest';
import {
  errorText,
  isContentPolicyError,
  isPermanentProviderError,
  isRetryableProviderError,
  nextPipelineRequeueMarker,
  pipelineRequeueCount,
  providerRetryDelayMs,
  sanitizeImagePromptForSafety,
  shouldRequeuePipeline,
  withRetries,
} from './retry.js';

describe('isRetryableProviderError', () => {
  it('retries timeouts, rate limits, and 5xx', () => {
    expect(isRetryableProviderError(new Error('The image provider took too long to respond. Try again.'))).toBe(true);
    expect(isRetryableProviderError({ status: 429, message: 'Rate limit exceeded' })).toBe(true);
    expect(isRetryableProviderError({ status: 500, message: 'Internal server error' })).toBe(true);
    expect(isRetryableProviderError(new Error('fetch failed'))).toBe(true);
  });

  it('does not retry billing or API key failures', () => {
    expect(isRetryableProviderError(new Error('OpenAI rejected the API key.'))).toBe(false);
    expect(isRetryableProviderError(new Error('OpenAI image generation is blocked by billing or quota.'))).toBe(false);
    expect(isPermanentProviderError(new Error('OpenAI rejected the API key.'))).toBe(true);
  });
});

describe('isContentPolicyError', () => {
  it('detects safety refusals', () => {
    expect(isContentPolicyError(new Error('OpenAI refused this prompt. Edit the scene prompt and retry.'))).toBe(true);
    expect(isContentPolicyError({ error: { code: 'content_policy_violation', message: 'safety' } })).toBe(true);
    expect(isContentPolicyError(new Error('timeout'))).toBe(false);
  });
});

describe('sanitizeImagePromptForSafety', () => {
  it('rewrites child terms and adds an adult family-friendly suffix', () => {
    const result = sanitizeImagePromptForSafety('A kid cook named Jens in a kitchen');
    expect(result).not.toMatch(/\bkid\b/i);
    expect(result).toContain('adult cook');
    expect(result).toContain('clearly adult character');
  });
});

describe('providerRetryDelayMs', () => {
  it('grows exponentially', () => {
    expect(providerRetryDelayMs(0, () => 0)).toBe(1200);
    expect(providerRetryDelayMs(1, () => 0)).toBe(2400);
    expect(providerRetryDelayMs(2, () => 0)).toBe(4800);
  });
});

describe('pipeline requeue markers', () => {
  it('counts and increments requeue markers', () => {
    expect(pipelineRequeueCount(undefined)).toBe(0);
    expect(pipelineRequeueCount('requeue:2')).toBe(2);
    expect(nextPipelineRequeueMarker('requeue:2')).toBe('requeue:3');
  });

  it('requeues transient errors until the cap', () => {
    expect(shouldRequeuePipeline(new Error('The character reference for Jens could not be generated.'), 0)).toBe(true);
    expect(shouldRequeuePipeline(new Error('The character reference for Jens could not be generated.'), 5)).toBe(false);
    expect(shouldRequeuePipeline(new Error('OpenAI rejected the API key.'), 0)).toBe(false);
  });
});

describe('withRetries', () => {
  it('returns the first success', async () => {
    const operation = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce('ok');
    await expect(withRetries(operation, { delayMs: () => 0 })).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('throws permanent errors immediately', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('OpenAI rejected the API key.'));
    await expect(withRetries(operation, { delayMs: () => 0 })).rejects.toThrow('API key');
    expect(operation).toHaveBeenCalledTimes(1);
  });
});

describe('errorText', () => {
  it('includes AppError-style details', () => {
    const error = Object.assign(new Error('Character failed'), { details: 'rate limit' });
    expect(errorText(error)).toContain('rate limit');
  });
});
