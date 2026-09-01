/**
 * Request timeout
 *
 * Without one, a stalled provider leaves the chat sitting in `sending` with no
 * error, no cancel, and no way back short of a reload. Shared so every provider
 * behaves the same way, including Gemini, whose SDK takes an `abortSignal` of
 * its own.
 */

const TIMEOUT_MS = 120_000;

export class ProviderTimeoutError extends Error {
  constructor(providerName: string) {
    super(`${providerName} did not respond within ${TIMEOUT_MS / 1000} seconds. The request was cancelled.`);
    this.name = 'ProviderTimeoutError';
  }
}

/** Caller must invoke `done()` so a completed request stops holding a timer. */
export function createTimeoutSignal(): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  providerName: string
): Promise<Response> {
  const { signal, done } = createTimeoutSignal();

  try {
    return await fetch(url, { ...init, signal });
  } catch (error) {
    if (signal.aborted) throw new ProviderTimeoutError(providerName);
    throw error;
  } finally {
    done();
  }
}
