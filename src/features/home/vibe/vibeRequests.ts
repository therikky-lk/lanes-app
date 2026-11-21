/** Bound optional catalog work without letting a rejected request kill a wave. */
export function within<T>(request: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(fallback), Math.max(0, ms));
    request.then(value => { clearTimeout(timer); resolve(value); }, () => { clearTimeout(timer); resolve(fallback); });
  });
}

/** Use enough available results immediately rather than waiting for the slowest source. */
export function collectAvailable<T extends { id: string }>(
  requests: Promise<T[]>[], ms: number, minimum: number,
): Promise<T[]> {
  return new Promise(resolve => {
    const items = new Map<string, T>();
    let remaining = requests.length;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve([...items.values()]);
    };
    const timer = setTimeout(finish, Math.max(0, ms));
    if (!remaining) { finish(); return; }
    for (const request of requests) {
      request.catch(() => []).then(tracks => {
        if (done) return;
        for (const track of tracks) if (track.id) items.set(track.id, track);
        if (--remaining === 0 || items.size >= minimum) finish();
      });
    }
  });
}
