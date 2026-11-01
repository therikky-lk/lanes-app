/** Repair artwork saved by older builds that used the Invidious redirect host. */
export function normalizeCoverUrl(value: string): string {
  try {
    const url = new URL(value);
    const videoId = url.pathname.match(/^\/vi\/([a-zA-Z0-9_-]{11})\/[^/]+$/)?.[1];
    if (url.hostname === "yt.chocolatemoo53.com" && videoId) {
      return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    }
  } catch { /* Local and data artwork is kept as supplied. */ }
  return value;
}
