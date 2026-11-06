/** Resolve a small window concurrently, but consume results in input order. */
export async function* prefetchInOrder<T, R>(
  items: readonly T[],
  concurrency: number,
  resolve: (item: T, index: number) => Promise<R>,
  signal: AbortSignal,
): AsyncGenerator<{ item: T; result: PromiseSettledResult<R> }> {
  const pending = new Map<number, Promise<PromiseSettledResult<R>>>();
  let next = 0;
  const fill = () => {
    while (!signal.aborted && next < items.length && pending.size < Math.max(1, concurrency)) {
      const index = next++;
      // Attach both handlers immediately: a later request can fail before its turn.
      pending.set(index, Promise.resolve().then(() => resolve(items[index], index)).then(
        (value) => ({ status: "fulfilled" as const, value }),
        (reason: unknown) => ({ status: "rejected" as const, reason }),
      ));
    }
  };
  fill();
  for (let index = 0; index < items.length && !signal.aborted; index++) {
    const result = await pending.get(index)!;
    if (signal.aborted) return;
    pending.delete(index);
    fill();
    yield { item: items[index], result };
  }
}
