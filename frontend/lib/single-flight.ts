/**
 * Wrap an async producer so that concurrent calls share a single in-flight
 * execution. While one call is pending, every other caller awaits the SAME
 * promise instead of starting its own run. Once it settles (resolve or reject),
 * the slot is cleared so the next call starts fresh.
 *
 * Used to dedupe token refreshes: when a page fires many requests that all 401
 * at once, they must trigger ONE refresh, not a storm of competing ones.
 */
export function createSingleFlight<T>(producer: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;
  return () => {
    if (inFlight) return inFlight;
    inFlight = producer().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}
