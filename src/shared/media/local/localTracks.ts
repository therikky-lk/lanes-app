// Tracks the user uploaded from their own audio files. The audio stays on this
// device (IndexedDB); the player streams it from a Blob.
import type { Track } from "@/shared/types";
import { parseId3, tagsFromFileName } from "./id3";
import { getCustomLyrics, setCustomLyrics } from "@/shared/media/lyrics/customLyrics";

export const LOCAL_TRACK_PREFIX = "local:";

export interface LocalTrackRecord {
  id: string;
  title: string;
  artists: string;
  album?: string;
  durationMs: number;
  coverDataUrl?: string;
  lyrics?: string;
  /** "liked" on this device; local files can't be liked on the server */
  likedAt?: number;
  mimeType: string;
  size: number;
  fileName: string;
  addedAt: number;
  blob: Blob;
}

const DB_NAME = "lane-local-media";
const STORE = "tracks";
const MAX_FILE_BYTES = 300 * 1024 * 1024;

export function isLocalTrackId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(LOCAL_TRACK_PREFIX);
}

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const req = run(d.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

const listeners = new Set<() => void>();
export function onLocalTracksChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const emit = () => listeners.forEach((l) => l());

export async function listLocalTracks(): Promise<LocalTrackRecord[]> {
  const all = await tx<LocalTrackRecord[]>("readonly", (s) => s.getAll());
  return all.sort((a, b) => b.addedAt - a.addedAt);
}

export function getLocalTrack(id: string): Promise<LocalTrackRecord | undefined> {
  return tx<LocalTrackRecord | undefined>("readonly", (s) => s.get(id));
}

export async function removeLocalTrack(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
  if (getCustomLyrics(id)) setCustomLyrics(id, "");
  emit();
}

export async function updateLocalTrack(
  id: string,
  patch: Partial<Pick<LocalTrackRecord, "title" | "artists" | "album" | "lyrics" | "likedAt">>,
): Promise<void> {
  const current = await getLocalTrack(id);
  if (!current) return;
  await tx("readwrite", (s) => s.put({ ...current, ...patch }));
  emit();
}

function readDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    const done = (ms: number) => {
      URL.revokeObjectURL(url);
      resolve(ms);
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : 0);
    audio.onerror = () => done(0);
    setTimeout(() => done(0), 8000);
    audio.src = url;
  });
}

/** cover art scaled down to keep the persisted queue small */
async function coverToDataUrl(cover: { mime: string; data: Uint8Array }): Promise<string | undefined> {
  try {
    const bitmap = await createImageBitmap(new Blob([cover.data.slice().buffer], { type: cover.mime }));
    const size = Math.min(400, Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    const scale = size / Math.min(bitmap.width, bitmap.height);
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
    return canvas.toDataURL("image/jpeg", 0.86);
  } catch {
    return undefined;
  }
}

export async function setLocalTrackLiked(id: string, liked: boolean): Promise<void> {
  await updateLocalTrack(id, { likedAt: liked ? Date.now() : undefined });
}

export async function listLikedLocalTracks(): Promise<LocalTrackRecord[]> {
  return (await listLocalTracks()).filter((r) => r.likedAt).sort((a, b) => (b.likedAt ?? 0) - (a.likedAt ?? 0));
}

export function isSupportedAudioFile(file: File): boolean {
  return /^audio\//.test(file.type) || /\.(mp3|m4a|aac|ogg|oga|opus|flac|wav|webm)$/i.test(file.name);
}

export async function addLocalFiles(files: Iterable<File>): Promise<{ added: LocalTrackRecord[]; skipped: string[] }> {
  const added: LocalTrackRecord[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    if (!isSupportedAudioFile(file) || file.size > MAX_FILE_BYTES) {
      skipped.push(file.name);
      continue;
    }
    const head = await file.slice(0, Math.min(file.size, 4 * 1024 * 1024)).arrayBuffer();
    const tags = parseId3(head);
    const fromName = tagsFromFileName(file.name);
    const record: LocalTrackRecord = {
      id: `${LOCAL_TRACK_PREFIX}${crypto.randomUUID()}`,
      title: tags.title || fromName.title || file.name,
      artists: tags.artist || fromName.artist || "",
      ...(tags.album ? { album: tags.album } : {}),
      durationMs: await readDuration(file),
      ...(tags.lyrics ? { lyrics: tags.lyrics } : {}),
      mimeType: file.type || "audio/mpeg",
      size: file.size,
      fileName: file.name,
      addedAt: Date.now(),
      blob: file,
    };
    if (tags.cover) {
      const cover = await coverToDataUrl(tags.cover);
      if (cover) record.coverDataUrl = cover;
    }
    try {
      await tx("readwrite", (s) => s.put(record));
      added.push(record);
      // lyrics embedded in the file (USLT) become the track's own lyrics
      if (record.lyrics && !getCustomLyrics(record.id)) setCustomLyrics(record.id, record.lyrics);
    } catch {
      skipped.push(file.name);
    }
  }
  if (added.length) emit();
  return { added, skipped };
}

export function localRecordToTrack(record: LocalTrackRecord): Track {
  // "A & B" from the file's tags reads as two artists, like everywhere else
  const artistList = record.artists
    ? record.artists
        .split(/\s*,\s*|\s+(?:&|×|x|feat\.?|ft\.?|featuring)\s+/i)
        .map((name) => name.trim())
        .filter(Boolean)
        .map((name) => ({ id: "", name }))
    : [];
  return {
    id: record.id,
    title: record.title,
    artists: artistList.map((a) => a.name).join(", "),
    coverUrl: record.coverDataUrl ?? "",
    durationMs: record.durationMs,
    playCount: 0,
    artistList,
    ...(record.album ? { album: { id: "local", title: record.album } } : {}),
  };
}
