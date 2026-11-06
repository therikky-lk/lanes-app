export interface IncomingLink { type: "artist" | "album" | "playlist" | "track" | "share" | "shortcut"; id: string }
const patterns: Record<IncomingLink["type"], RegExp> = {
  artist: /^UC[A-Za-z0-9_-]{22}$/, album: /^MPRE[A-Za-z0-9_-]{4,64}$/,
  playlist: /^[A-Za-z0-9_-]{8,180}$/, track: /^[A-Za-z0-9_-]{11}$/,
  share: /^[A-Za-z0-9_-]{22}$/, shortcut: /^(wave|likes|settings)$/,
};
export function parseIncomingLink(raw: string): IncomingLink | null {
  try {
    const url = new URL(raw);
    if (url.username || url.password || url.hash) return null;
    let type: string, id: string;
    if (url.protocol === "https:" && url.host === "lane-app.site") {
      const match = url.pathname.match(/^\/s\/([A-Za-z0-9_-]{22})$/);
      if (match && !url.search) return { type: "share", id: match[1] };
      type = url.pathname.slice(1);
    } else if (url.protocol === "lane:" || url.protocol === "liner:") {
      if (url.pathname && url.pathname !== "/") return null;
      type = url.hostname;
    } else return null;
    const ids = url.searchParams.getAll("id");
    if (ids.length !== 1 || [...url.searchParams.keys()].some(key => key !== "id")) return null;
    id = ids[0];
    if (!Object.hasOwn(patterns, type) || !patterns[type as IncomingLink["type"]].test(id)) return null;
    return { type: type as IncomingLink["type"], id };
  } catch { return null; }
}
