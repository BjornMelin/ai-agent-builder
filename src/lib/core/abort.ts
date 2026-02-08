/**
 * Register an abort handler with automatic cleanup.
 *
 * @param signal - Abort signal to listen to.
 * @param onAbort - Callback invoked when the signal aborts.
 * @returns Cleanup function to remove the event listener.
 */
export function addAbortListener(
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
