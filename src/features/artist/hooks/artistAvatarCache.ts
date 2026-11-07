import { resolveArtistAvatar } from "./artistAvatar";
import { prepareCoverFallback } from "@/features/covers/lib/coverSigner";

const CACHE = "liner-covers-v2";
const PATH = "/__lane_artist_avatar__/";
const MAX_BYTES = 32 * 1024 * 1024;
const MAX_ENTRIES = 128;
const memory = new Map<string, { url: string | null; expires: number }>();
const pending = new Map<string, Promise<string | null>>();
const listeners = new Map<string, Set<() => void>>();
let generation = 0;
let writes: Promise<unknown> = Promise.resolve();

export const artistAvatarKey = (id?: string, name?: string) => id && id !== "unknown" && id !== name
  ? `id:${id}` : `name:${name?.normalize("NFKC").trim().toLocaleLowerCase() ?? ""}`;

export function peekArtistAvatar(key: string): string | null {
  return memory.get(key)?.url ?? null;
}

export function subscribeArtistAvatar(key: string, listener: () => void): () => void {
  const set = listeners.get(key) ?? new Set();
  listeners.set(key, set); set.add(listener);
  return () => { set.delete(listener); if (!set.size) listeners.delete(key); };
}

function remember(key: string, url: string | null, persistent = false): void {
  memory.set(key, { url, expires: persistent ? Infinity : Date.now() + (url ? 60 * 60_000 : 30_000) });
  for (const listener of listeners.get(key) ?? []) listener();
  while (memory.size > MAX_ENTRIES) {
    const oldest = [...memory.keys()].find(value => !listeners.has(value));
    if (!oldest) break;
    const old = memory.get(oldest)?.url;
    if (old?.startsWith("blob:")) URL.revokeObjectURL(old);
    memory.delete(oldest);
  }
}

export function clearArtistAvatarMemory(): void {
  generation++;
  for (const entry of memory.values()) if (entry.url?.startsWith("blob:")) URL.revokeObjectURL(entry.url);
  memory.clear();
  pending.clear();
}

async function trim(cache: Cache): Promise<void> {
  const keys = (await cache.keys()).filter(request => new URL(request.url).pathname.startsWith(PATH));
  let bytes = 0;
  const sizes = await Promise.all(keys.map(async key => Number((await cache.match(key))?.headers.get("content-length")) || 0));
  for (const size of sizes) bytes += size;
  let remaining = keys.length;
  for (let i = 0; i < keys.length && (remaining > MAX_ENTRIES || bytes > MAX_BYTES); i++) {
    await cache.delete(keys[i]); bytes -= sizes[i]; remaining--;
  }
}

/** Persist the image bytes, so reopening an artist needs neither catalog nor CDN. */
export function loadArtistAvatar(id?: string, name?: string, sourceUrl?: string): Promise<string | null> {
  const key = artistAvatarKey(id, name);
  const existing = memory.get(key);
  if (existing && existing.expires > Date.now()) return Promise.resolve(existing.url);
  const running = pending.get(key);
  if (running) return running;
  const epoch = generation;
  const request = (async () => {
    const cacheKey = new URL(PATH + encodeURIComponent(key), "https://lane-avatar-cache.invalid").href;
    let cache: Cache | undefined;
    try { cache = await window.caches?.open(CACHE); } catch { /* A blocked cache must not hide the photo. */ }
    let blob = await cache?.match(cacheKey).then(response => response?.blob()).catch(() => undefined);
    let url: string | null = null;
    if (!blob?.size) {
      url = sourceUrl || await resolveArtistAvatar(id, name);
      if (epoch !== generation) return null;
      remember(key, url);
      if (url) {
        const originalUrl = url;
        // Show the URL immediately. Downloading or persisting an avatar must
        // never keep the photo beside the artist's name invisible.
        void (async () => {
        const download = async (source: string) => {
          const response = await fetch(source, { signal: AbortSignal.timeout(5000) });
          if (!response.ok) throw new Error("avatar unavailable");
          const result = await response.blob();
          if (!result.size || result.size > 5 * 1024 * 1024 || !result.type.startsWith("image/")) throw new Error("invalid avatar");
          return result;
        };
        try { blob = await download(originalUrl); }
        catch {
          try { const fallback = await prepareCoverFallback(originalUrl); if (fallback) blob = await download(fallback); } catch { /* Keep the original URL as a display fallback. */ }
        }
        if (blob && cache && epoch === generation) {
          const image = blob;
          writes = writes.catch(() => {}).then(async () => {
            if (epoch !== generation) return;
            await cache.put(cacheKey, new Response(image, { headers: { "content-type": image.type, "content-length": String(image.size) } }));
            await trim(cache);
          });
          await writes.catch(() => {});
        }
        if (blob?.size && epoch === generation) remember(key, URL.createObjectURL(blob), true);
        })().catch(() => {});
      }
      return url;
    }
    if (epoch !== generation) return null;
    if (blob?.size) url = URL.createObjectURL(blob);
    remember(key, url, !!blob);
    return url;
  })().finally(() => { if (pending.get(key) === request) pending.delete(key); });
  pending.set(key, request);
  return request;
}
