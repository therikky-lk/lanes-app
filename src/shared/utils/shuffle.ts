/**
 * Fisher–Yates: every order equally likely. `list.sort(() => Math.random() - 0.5)`
 * isn't: items tend to stay near where they started, and the result depends
 * on the engine's sort.
 */
export function shuffle<T>(list: readonly T[], random: () => number = Math.random): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
