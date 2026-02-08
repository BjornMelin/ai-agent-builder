import "server-only";

/**
 * Error thrown when a fetch call exceeds its timeout budget.
 */
export class FetchTimeoutError extends Error {
  public readonly timeoutMs: number;

  /**
   * Create a {@link FetchTimeoutError}.
   *
   * @param timeoutMs - Timeout budget in milliseconds.
   */
  public constructor(timeoutMs: number) {
    super(`Fetch timed out after ${timeoutMs}ms.`);
    this.name = "FetchTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

function addAbortListener(
  signal: AbortSignal,
  onAbort: () => void,
): () => void {
  if (signal.aborted) {
    onAbort();
    return () => undefined;
  }

  signal.addEventListener("abort", onAbort, { once: true });
  return () => {
    signal.removeEventListener("abort", onAbort);
  };
}

/**
 * Execute a fetch call with a hard timeout and optional external abort signal.
 *
 * @param input - Fetch input.
 * @param init - Fetch init.
 * @param options - Timeout/abort options.
 * @returns Fetch response.
 * @throws RangeError - When timeoutMs is not finite or outside 1-120000.
 * @throws FetchTimeoutError - When the request exceeds the timeout budget.
 * @throws Error - When the underlying fetch fails for reasons other than timeout.
 */
export async function fetchWithTimeout(
  input: FetchInput,
  init: FetchInit,
  options: Readonly<{
    timeoutMs: number;
    signal?: AbortSignal | undefined;
  }>,
): Promise<Response> {
  if (!Number.isFinite(options.timeoutMs)) {
    throw new RangeError("timeoutMs must be a finite number.");
  }
  if (options.timeoutMs < 1 || options.timeoutMs > 120_000) {
    throw new RangeError("timeoutMs must be between 1 and 120000.");
  }
  const timeoutMs = options.timeoutMs;
  const controller = new AbortController();
  let abortedByTimeout = false;

  const cleanupFns: Array<() => void> = [];

  if (options.signal) {
    cleanupFns.push(
      addAbortListener(options.signal, () => {
        controller.abort(options.signal?.reason);
      }),
    );
  }

  if (init?.signal) {
    cleanupFns.push(
      addAbortListener(init.signal, () => {
        controller.abort(init.signal?.reason);
      }),
    );
  }

  const timeoutId = setTimeout(() => {
    abortedByTimeout = true;
    controller.abort(new FetchTimeoutError(timeoutMs));
  }, timeoutMs);

  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    return response;
  } catch (error) {
    if (abortedByTimeout) {
      throw new FetchTimeoutError(timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    for (const fn of cleanupFns) {
      fn();
    }
  }
}

/**
 * Returns true when the error is a {@link FetchTimeoutError}.
 *
 * @param error - Unknown error.
 * @returns True when error is a FetchTimeoutError.
 */
export function isFetchTimeoutError(
  error: unknown,
): error is FetchTimeoutError {
  return error instanceof FetchTimeoutError;
}
