/**
 * Shared cover-art loader.
 *
 * The registry shares cover readiness and resolved proxy URLs between surfaces.
 * List images use the browser's lazy loading. Playback surfaces can explicitly
 * preload artwork and reuse the browser or service-worker cache.
 *
 * Standardizing on `crossOrigin = "anonymous"` is deliberate: the WebGL
 * background needs a non-tainted texture and the mini player samples pixels for
 * its accent color, both of which require CORS. The cover CDNs all return
 * `Access-Control-Allow-Origin: *`, so this never costs us a request.
 */

import { useCallback, useSyncExternalStore } from "react";
import { prepareCoverFallback } from "./coverSigner";
import { normalizeCoverUrl } from "./normalizeCoverUrl";

type CoverStatus = "loading" | "loaded" | "error";

interface CoverEntry {
  status: CoverStatus;
  /**
   * The URL that actually decoded — the direct CDN `url` when it loads, or the
   * covers proxy when the direct URL failed and the fallback succeeded. Lets
   * surfaces that can't self-swap on error (CSS backgrounds, the WebGL texture)
   * read the working URL up front via `useCoverSrc`.
   */
  effectiveUrl?: string;
  /** Resolves once the load settles (loaded or errored); never rejects. */
  promise: Promise<void>;
  element?: WeakRef<HTMLImageElement>;
}

const entries = new Map<string, CoverEntry>();
const listeners = new Map<string, Set<() => void>>();
const MAX_SETTLED_ENTRIES = 512;
// Keep a small working set for color sampling and the player's WebGL texture.
// List rows own their rendered images, so the registry never pins their DOM.
const PRELOAD_PIXEL_BUDGET = 4 * 1024 * 1024;
const preloaded = new Map<string, { image: HTMLImageElement; pixels: number }>();
let preloadedPixels = 0;

function dropPreload(url: string): void {
  const entry = preloaded.get(url);
  if (!entry) return;
  preloadedPixels -= entry.pixels;
  preloaded.delete(url);
}

function retainPreload(url: string, image: HTMLImageElement): void {
  dropPreload(url);
  const pixels = image.naturalWidth * image.naturalHeight;
  if (pixels <= 0 || pixels > PRELOAD_PIXEL_BUDGET) return;
  while (preloadedPixels + pixels > PRELOAD_PIXEL_BUDGET) {
    const oldest = preloaded.keys().next().value;
    if (oldest === undefined) break;
    dropPreload(oldest);
  }
  preloaded.set(url, { image, pixels });
  preloadedPixels += pixels;
}

function touchSettled(url: string, entry: CoverEntry): void {
  entries.delete(url);
  entries.set(url, entry);
  if (entries.size <= MAX_SETTLED_ENTRIES) return;
  for (const [key, item] of entries) {
    if (key === url || listeners.has(key) || item.status === "loading") continue;
    entries.delete(key);
    dropPreload(key);
    if (entries.size <= MAX_SETTLED_ENTRIES) break;
  }
}

function imageFor(url: string, entry: CoverEntry): HTMLImageElement | undefined {
  return entry.element?.deref() ?? preloaded.get(url)?.image;
}

function notify(url: string): void {
  const set = listeners.get(url);
  if (set) for (const listener of set) listener();
}

function subscribe(url: string, listener: () => void): () => void {
  let set = listeners.get(url);
  if (!set) {
    set = new Set();
    listeners.set(url, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) listeners.delete(url);
  };
}

/** True once the cover has successfully decoded (a strict, no-fade success). */
export function isCoverReady(url: string | undefined): boolean {
  return !!url && entries.get(url)?.status === "loaded";
}

/** Clears the in-memory cover entries registry and notifies all subscribers. */
export function clearCoverRegistry(): void {
  entries.clear();
  preloaded.clear();
  preloadedPixels = 0;
  for (const set of listeners.values()) {
    for (const listener of set) listener();
  }
}

export function getCoverElement(url: string | undefined): HTMLImageElement | undefined {
  if (!url) return undefined;
  const entry = entries.get(url);
  const direct = entry?.status === "loaded" ? imageFor(url, entry) : undefined;
  if (direct) return direct;
  for (const [key, item] of entries) {
    if (item.status !== "loaded") continue;
    const image = imageFor(key, item);
    if (image && (item.effectiveUrl === url || image.src === url)) return image;
  }
  return undefined;
}

/**
 * True once the cover load has settled — decoded OR failed. UI uses this to
 * stop the loading placeholder: a cover that 404s or is rate-limited still
 * settles, so the placeholder never pulses forever.
 */
function isCoverSettled(url: string | undefined): boolean {
  if (!url) return true;
  const status = entries.get(url)?.status;
  return status === "loaded" || status === "error";
}

/**
 * Record a cover as ready. Call from an `<img>`'s `onLoad` so a natural render
 * populates the same registry a `preloadCoverArt` call would. `effectiveUrl` is
 * the URL that actually decoded (the proxy when a `CoverImage` swapped to it),
 * so `useCoverSrc` consumers pick up the working URL.
 */
export function markCoverReady(url: string | undefined, effectiveUrl?: string, element?: HTMLImageElement): void {
  if (!url) return;
  const resolved = effectiveUrl ?? url;
  const entry = entries.get(url) ?? { status: "loading", promise: Promise.resolve() };
  const previousImage = imageFor(url, entry);
  const changed = entry.status !== "loaded" || entry.effectiveUrl !== resolved || (!previousImage && !!element);
  entry.effectiveUrl = resolved;
  if (element && typeof WeakRef !== "undefined") entry.element = new WeakRef(element);
  entry.status = "loaded";
  touchSettled(url, entry);
  if (changed) notify(url);
}

/**
 * Begin loading a cover if it isn't already tracked. Idempotent: repeated calls
 * for the same URL return the original in-flight promise.
 *
 * The covers.tryliner.fun proxy fallback (derived from `url`, see
 * `coverSigner`) is tried exactly once if the direct `url` fails to load, so
 * the registry only settles as "error" when both the direct CDN and the proxy
 * are unreachable (or the host isn't proxyable). Readiness stays keyed by the
 * primary `url`, so every surface observing it agrees regardless of which URL
 * ultimately decoded.
 */
export function preloadCoverArt(url: string | undefined): Promise<void> {
  if (!url || typeof window === "undefined") return Promise.resolve();

  const existing = entries.get(url);
  if (existing) {
    if (existing.status === "error") {
      // Evict stale failure to allow fresh retry on next navigation/mount
      entries.delete(url);
    } else {
      if (existing.status === "loaded") touchSettled(url, existing);
      return existing.promise;
    }
  }

  const source = normalizeCoverUrl(url);
  const img = new window.Image();
  img.crossOrigin = "anonymous";
  img.decoding = "async";

  let entry: CoverEntry;
  const promise = new Promise<void>((resolve) => {
    let triedFallback = false;
    const settle = (status: CoverStatus, effectiveUrl?: string) => {
      img.onload = null;
      img.onerror = null;
      if (entries.get(url) === entry) {
        if (status === "loaded") {
          retainPreload(url, img);
          markCoverReady(url, effectiveUrl, img);
        } else if (entry.status === "loading") {
          entry.status = "error";
          touchSettled(url, entry);
          notify(url);
        }
      }
      resolve();
    };
    img.onload = () => settle("loaded", img.src);
    img.onerror = () => {
      // Direct CDN URL failed (e.g. Google blocked by RKN). Retry once through
      // the proxy (derived from this URL, HMAC-signed on desktop) before
      // reporting the cover unavailable. A non-proxyable host yields no
      // fallback, so it settles as an error immediately.
      if (!triedFallback) {
        triedFallback = true;
        void prepareCoverFallback(source).then((fallback) => {
          if (fallback && entries.get(url) === entry && entry.status === "loading") img.src = fallback;
          else settle("error");
        }).catch(() => settle("error"));
        return;
      }
      settle("error");
    };
  });

  entry = { status: "loading", promise, effectiveUrl: source };
  entries.set(url, entry);
  img.src = source;
  return promise;
}

/**
 * Subscribe a component to a cover's readiness. Returns `true` synchronously
 * (via useSyncExternalStore) the moment the URL is already cached, so
 * revisiting a played track shows its art with no placeholder and no fade, and
 * a mid-render URL change never leaks the previous cover's state.
 */
export function useCoverReady(url: string | undefined): boolean {
  const subscribeToUrl = useCallback(
    (onChange: () => void) => {
      if (!url) return () => {};
      // Kick off the fetch here so simply rendering a cover loads it, without
      // callers needing a separate preload call.
      void preloadCoverArt(url);
      return subscribe(url, onChange);
    },
    [url],
  );

  return useSyncExternalStore(
    subscribeToUrl,
    () => isCoverSettled(url),
    () => false,
  );
}

/** The effective URL for a cover: the proxy once a direct load has failed over
 * to it, otherwise the direct `url` itself. */
function effectiveCoverSrc(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return entries.get(url)?.effectiveUrl ?? normalizeCoverUrl(url);
}

/**
 * Resolve the URL a surface should actually render for `url`, following the
 * direct→proxy fallback. For consumers that can't self-swap on a load error —
 * CSS `background-image`, the Kawarp WebGL texture — this returns the direct
 * URL first, then re-renders with the covers proxy once the direct URL is known
 * to have failed. Shares the single registry/loader, so it costs no extra
 * request beyond what `CoverImage`/`useCoverReady` already issue for the cover.
 */
export function useCoverSrc(url: string | undefined, preload = true): string | undefined {
  const subscribeToUrl = useCallback(
    (onChange: () => void) => {
      if (!url) return () => {};
      if (preload) void preloadCoverArt(url);
      return subscribe(url, onChange);
    },
    [url, preload],
  );

  return useSyncExternalStore(
    subscribeToUrl,
    () => effectiveCoverSrc(url),
    () => url,
  );
}

/**
 * Returns the decoded HTMLImageElement for `url` once ready, reactively
 * re-rendering surfaces (like Kawarp WebGL canvas) the moment the image settles
 * so textures can be loaded directly from in-memory pixels without extra network requests.
 */
export function useCoverElement(url: string | undefined): HTMLImageElement | undefined {
  const subscribeToUrl = useCallback(
    (onChange: () => void) => {
      if (!url) return () => {};
      void preloadCoverArt(url);
      return subscribe(url, onChange);
    },
    [url],
  );

  return useSyncExternalStore(
    subscribeToUrl,
    () => getCoverElement(url),
    () => undefined,
  );
}

