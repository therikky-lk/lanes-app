// The server keeps only a title and a description for user playlists. Things
// that have to reach every device travel at the end of the description behind
// an invisible separator; the app reads them back and never shows them:
//   ⁣lane-cover:<url>      an imported playlist's original cover
//   ⁣lane-local:<base64>   the user's own audio files added to the playlist
//                          (the audio stays on the device that has it)
const SEP = "⁣";
const ANY_MARK = /\s*⁣lane-(cover|local):([^\s⁣]+)/g;

function readMarker(description: string | null | undefined, kind: "cover" | "local"): string | undefined {
  if (!description) return undefined;
  for (const match of description.matchAll(ANY_MARK)) {
    if (match[1] === kind) return match[2];
  }
  return undefined;
}

function build(text: string, local: string | undefined, cover: string | undefined): string {
  const marks = `${local ? `${SEP}lane-local:${local}` : ""}${cover ? `${SEP}lane-cover:${cover}` : ""}`;
  if (!marks) return text;
  return `${text}${text ? "\n\n" : ""}${marks}`;
}

export function readCoverMarker(description: string | null | undefined): string | undefined {
  const url = readMarker(description, "cover");
  return url && /^https?:\/\//.test(url) ? url : undefined;
}

export function stripCoverMarker(description: string | null | undefined): string {
  return (description ?? "").replace(ANY_MARK, "").trim();
}

export function withCoverMarker(description: string | null | undefined, coverUrl: string | undefined): string {
  return build(stripCoverMarker(description), readMarker(description, "local"), coverUrl);
}

/** one of the user's own files in a playlist */
export interface LocalPlaylistEntry {
  /** local track id ("local:<uuid>") */
  id: string;
  title: string;
  artists: string;
  durationMs: number;
  /** the device the file lives on */
  deviceId: string;
  deviceName: string;
  addedAt: number;
}

type Packed = [string, string, string, number, string, string, number];

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

export function readLocalEntries(description: string | null | undefined): LocalPlaylistEntry[] {
  const raw = readMarker(description, "local");
  if (!raw) return [];
  try {
    const packed = JSON.parse(fromBase64Url(raw)) as Packed[];
    if (!Array.isArray(packed)) return [];
    return packed
      .filter((p) => Array.isArray(p) && typeof p[0] === "string" && p[0].startsWith("local:"))
      .map(([id, title, artists, durationMs, deviceId, deviceName, addedAt]) => ({
        id,
        title: String(title ?? ""),
        artists: String(artists ?? ""),
        durationMs: Number(durationMs) || 0,
        deviceId: String(deviceId ?? ""),
        deviceName: String(deviceName ?? ""),
        addedAt: Number(addedAt) || 0,
      }));
  } catch {
    return [];
  }
}

export function withLocalEntries(description: string | null | undefined, entries: LocalPlaylistEntry[]): string {
  const packed: Packed[] = entries.map((e) => [
    e.id,
    e.title.slice(0, 80),
    e.artists.slice(0, 60),
    Math.round(e.durationMs),
    e.deviceId,
    e.deviceName.slice(0, 40),
    e.addedAt,
  ]);
  const local = packed.length > 0 ? toBase64Url(JSON.stringify(packed)) : undefined;
  return build(stripCoverMarker(description), local, readCoverMarker(description));
}
