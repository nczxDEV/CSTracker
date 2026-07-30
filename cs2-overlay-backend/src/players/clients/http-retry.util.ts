import { Logger } from '@nestjs/common';

/**
 * Simple outbound retry/backoff helper for external APIs (FACEIT, Steam).
 *
 * IMPORTANT: this protects OUTBOUND calls (so resolving a 10-player
 * roster doesn't needlessly trip over a momentary 429), it does NOT
 * replace the inbound `ThrottlerGuard`, which limits requests coming
 * from the client.
 *
 * Only retries on 429 (Too Many Requests) and 503 (Service Unavailable)
 * responses, with exponential backoff, up to `maxAttempts` times.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; baseDelayMs?: number; logger?: Logger; label?: string } = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 300;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const status = err?.response?.status;
      const isRetryable = status === 429 || status === 503;
      if (!isRetryable || attempt === maxAttempts) {
        throw err;
      }
      const retryAfterHeader = err?.response?.headers?.['retry-after'];
      const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : undefined;
      const delay = retryAfterMs ?? baseDelayMs * 2 ** (attempt - 1);
      options.logger?.warn(
        `${options.label ?? 'HTTP'} ${status} - retrying ${attempt}/${maxAttempts} in ${delay}ms.`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
