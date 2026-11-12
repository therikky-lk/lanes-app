// The server keeps only a title and a description for user playlists. Things
// that have to reach every device travel at the end of the description behind
// an invisible separator; the app reads them back and never shows them:
//   ⁣lane-cover:<url>      an imported or user-selected playlist cover
//   ⁣lane-local:<base64>   the user's own audio files added to the playlist
//                          (the audio stays on the device that has it)
//   ⁣lane-source:<name>   the integration that owns the imported playlist
const SEP = "⁣";
// The production API currently rejects descriptions above 2,000 characters.
// Keep margin for its validation/normalization and never truncate user text.
export const MAX_PLAYLIST_DESCRIPTION_LENGTH = 2_000;
const ANY_MARK = /\s*⁣lane-(cover|local|source):([^\s⁣]+)/g;

function readMarker(description: string | null | undefined, kind: "cover" | "local" | "source"): string | undefined {
  if (!description) return undefined;
  for (const match of description.matchAll(ANY_MARK)) {
    if (match[1] === kind) return match[2];
  }
  return undefined;
}

function build(text: string, local: string | undefined, cover: string | undefined, source: string | undefined): string {
  const localMark = local ? `${SEP}lane-local:${local}` : "";
  const coverMark = cover ? `${SEP}lane-cover:${cover}` : "";
  const sourceMark = source ? `${SEP}lane-source:${source}` : "";
  const separator = text ? "\n\n" : "";

  // Local entries are user data and must stay intact. Covers are optional
  // metadata, so omit one that cannot fit rather than sending an invalid PATCH.
  if (localMark.length > MAX_PLAYLIST_DESCRIPTION_LENGTH) {
    throw new Error("Список локальных треков слишком велик для описания плейлиста.");
  }
  if (text.length + separator.length + localMark.length > MAX_PLAYLIST_DESCRIPTION_LENGTH) {
    throw new Error("Описание и локальные треки превышают лимит сервера. Данные сохранены без изменений.");
  }
  if (text.length + separator.length + localMark.length + coverMark.length + sourceMark.length > MAX_PLAYLIST_DESCRIPTION_LENGTH) {
    throw new Error("Описание плейлиста превышает лимит сервера. Данные сохранены без изменений.");
  }

  const marks = `${localMark}${coverMark}${sourceMark}`;
  if (!marks) return text;
  return `${text}${text ? "\n\n" : ""}${marks}`;
}

export function readCoverMarker(description: string | null | undefined): string | undefined {
  const url = readMarker(description, "cover");
  return url && (/^https?:\/\//.test(url) || /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=_-]+$/i.test(url))
    ? url
    : undefined;
}

export function stripCoverMarker(description: string | null | undefined): string {
  return (description ?? "").replace(ANY_MARK, "").trim();
}

export function readPlaylistSource(description: string | null | undefined): string | undefined {
  return readMarker(description, "source");
}

export function importedPlaylistDescription(source: "yandex"): string {
  return build("", undefined, undefined, source);
}

export function withCoverMarker(description: string | null | undefined, coverUrl: string | undefined): string {
  const original = description ?? "";
  let next: string;
  try {
    next = build(stripCoverMarker(original), readMarker(original, "local"), coverUrl, readPlaylistSource(original));
  } catch (error) {
    if (coverUrl) return original;
    throw error;
  }
  // If the cover doesn't fit, preserve the original description byte for byte.
  if (coverUrl && readCoverMarker(next) !== coverUrl) return original;
  return next;
}

/** Replace visible description text while preserving playlist metadata. */
export function withDescriptionText(description: string | null | undefined, text: string): string {
  return build(text, readMarker(description, "local"), readCoverMarker(description), readPlaylistSource(description));
}

export function hasCoverMarker(description: string | null | undefined, coverUrl: string | undefined): boolean {
  return readCoverMarker(description) === coverUrl;
}

export function canSyncCoverMarker(description: string | null | undefined, coverUrl: string | undefined): boolean {
  try {
    const next = withCoverMarker(description, coverUrl);
    return next.length <= 2_000 && hasCoverMarker(next, coverUrl);
  } catch {
    return false;
  }
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
  return build(stripCoverMarker(description), local, readCoverMarker(description), readPlaylistSource(description));
}
