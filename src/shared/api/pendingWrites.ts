const pendingWrites = new Set<Promise<unknown>>();

export function trackPendingWrite<T>(promise: Promise<T>): Promise<T> {
  pendingWrites.add(promise);
  void promise.then(
    () => pendingWrites.delete(promise),
    () => pendingWrites.delete(promise),
  );
  return promise;
}

export async function waitForPendingWrites(): Promise<void> {
  while (pendingWrites.size > 0) {
    await Promise.allSettled([...pendingWrites]);
  }
}
