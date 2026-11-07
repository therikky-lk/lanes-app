/** Give the preferred host a short head start, without blocking on its timeout. */
export async function resolvePlaybackSources<T>(
  preferred: (signal: AbortSignal) => Promise<T | null>,
  fallback: (signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
  headStartMs = 200,
): Promise<T> {
  signal?.throwIfAborted();
  const preferredAbort = new AbortController();
  const fallbackAbort = new AbortController();
  const preferredSignal = signal ? AbortSignal.any([signal, preferredAbort.signal]) : preferredAbort.signal;
  const fallbackSignal = signal ? AbortSignal.any([signal, fallbackAbort.signal]) : fallbackAbort.signal;
  let startFallback!: () => void;
  const ready = new Promise<void>((resolve) => { startFallback = resolve; });
  const timer = setTimeout(startFallback, headStartMs);
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    if (!signal) return;
    onAbort = () => reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  const primary = Promise.resolve().then(() => preferred(preferredSignal)).then((stream) => {
    if (stream !== null) return stream;
    startFallback();
    throw new Error("Preferred audio unavailable");
  }, (error) => {
    startFallback();
    throw error;
  });
  const secondary = ready.then(() => {
    fallbackSignal.throwIfAborted();
    return fallback(fallbackSignal);
  });
  try {
    return await Promise.race([Promise.any([primary, secondary]), aborted]);
  } catch (error) {
    if (error instanceof AggregateError) throw error.errors[1];
    throw error;
  } finally {
    clearTimeout(timer);
    if (signal && onAbort) signal.removeEventListener("abort", onAbort);
    preferredAbort.abort();
    fallbackAbort.abort();
    startFallback();
  }
}
