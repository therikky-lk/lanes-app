import { diag } from "./diag";
// Android: playback runs in a native ExoPlayer (background audio, media
// notification, lock screen). The player engine and the lyrics view keep talking
// to an <audio id="liner-audio"> element; on Android that element is a real
// HTMLAudioElement whose media properties and events are forwarded to the native
// player, so nothing above this file has to know the difference.
import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

interface NativeState {
  playing: boolean;
  playWhenReady?: boolean;
  seekable?: boolean;
  buffering: boolean;
  ended: boolean;
  positionMs: number;
  durationMs: number;
  error?: string;
}

interface LaneAudioPlugin {
  load(options: {
    url: string;
    headers?: Record<string, string>;
    title?: string;
    artist?: string;
    album?: string;
    artwork?: string;
    startPositionMs?: number;
    autoplay?: boolean;
  }): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  seek(options: { positionMs: number }): Promise<void>;
  setVolume(options: { volume: number }): Promise<void>;
  setRate(options: { rate: number }): Promise<void>;
  setLiked(options: { liked: boolean }): Promise<void>;
  setRepeat(options: { mode: number }): Promise<void>;
  writeCacheFile(options: { name: string; base64: string }): Promise<{ url: string }>;
  queueNext(options: {
    afterTrackId: string;
    items: {
      trackId: string;
      url: string;
      headers?: Record<string, string>;
      title?: string;
      artist?: string;
      album?: string;
      artwork?: string;
    }[];
  }): Promise<void>;
  clearNext(): Promise<void>;
  addListener(event: "advanced", cb: (a: { trackId: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: "state", cb: (s: NativeState) => void): Promise<PluginListenerHandle>;
  addListener(event: "remote", cb: (r: { action: string; positionMs: number }) => void): Promise<PluginListenerHandle>;
}

export const LaneAudio = registerPlugin<LaneAudioPlugin>("LaneAudio");

export interface NowPlayingMeta {
  /** lets the native player tell which track it is on */
  trackId?: string;
  title?: string;
  artist?: string;
  album?: string;
  artwork?: string;
}

let nowPlaying: NowPlayingMeta = {};
/** what the notification / lock screen should show for the next load */
export function setNativeNowPlaying(meta: NowPlayingMeta): void {
  nowPlaying = meta;
}

let headersForUrl: (url: string) => Record<string, string> = () => ({});
export function setNativeHeaderProvider(fn: (url: string) => Record<string, string>): void {
  headersForUrl = fn;
}

type RemoteHandler = (action: string, positionMs: number) => void;
let remoteHandler: RemoteHandler | null = null;
export function onNativeRemote(handler: RemoteHandler): void {
  remoteHandler = handler;
}

// the notification's like button
let likeHandler: (() => void) | null = null;
export function onNativeLike(handler: (() => void) | null): void {
  likeHandler = handler;
}

// the notification's repeat button
let repeatHandler: (() => void) | null = null;
export function onNativeRepeat(handler: (() => void) | null): void {
  repeatHandler = handler;
}

// the native player switched to the queued next track by itself
let advancedHandler: ((trackId: string) => void) | null = null;
export function onNativeAdvanced(handler: ((trackId: string) => void) | null): void {
  advancedHandler = handler;
}

export interface NativeNextItem {
  trackId: string;
  source: { url?: string; blob?: Blob };
  meta: Omit<NowPlayingMeta, "trackId">;
}

/**
 * Hand the native player the tracks after `afterTrackId` ahead of time: it
 * then moves on by itself when one ends, even while the page is asleep
 * (screen off, another app in front).
 */
export async function queueNativeNext(afterTrackId: string, items: NativeNextItem[]): Promise<void> {
  const out: Parameters<LaneAudioPlugin["queueNext"]>[0]["items"] = [];
  for (const item of items) {
    let url = item.source.url ?? "";
    if (item.source.blob) {
      const ext = (item.source.blob.type.split("/")[1] || "bin").replace(/[^a-z0-9]/gi, "");
      url = (await LaneAudio.writeCacheFile({ name: `next-${item.trackId.replace(/[^a-z0-9]/gi, "")}.${ext}`, base64: await blobToBase64(item.source.blob) })).url;
    }
    if (!url) continue;
    out.push({ trackId: item.trackId, url, headers: url.startsWith("http") ? headersForUrl(url) : {}, ...item.meta });
  }
  await LaneAudio.queueNext({ afterTrackId, items: out });
}

export function clearNativeNext(): void {
  void LaneAudio.clearNext().catch(() => undefined);
}

// blob: URLs are page-local; remember the Blob behind each one so it can be
// handed to the native player as a file
const blobsByUrl = new Map<string, Blob>();
let blobTrackingInstalled = false;
function trackBlobUrls(): void {
  if (blobTrackingInstalled) return;
  blobTrackingInstalled = true;
  const create = URL.createObjectURL.bind(URL);
  const revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (obj: Blob | MediaSource) => {
    const url = create(obj);
    if (obj instanceof Blob) blobsByUrl.set(url, obj);
    return url;
  };
  URL.revokeObjectURL = (url: string) => {
    blobsByUrl.delete(url);
    revoke(url);
  };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

class NativeMediaError {
  readonly MEDIA_ERR_ABORTED = 1;
  readonly MEDIA_ERR_NETWORK = 2;
  readonly MEDIA_ERR_DECODE = 3;
  readonly MEDIA_ERR_SRC_NOT_SUPPORTED = 4;
  constructor(
    readonly code: number,
    readonly message: string,
  ) {}
}

/** an <audio> element whose playback happens in the native player */
export function createNativeAudioElement(): HTMLAudioElement {
  trackBlobUrls();
  const el = document.createElement("audio");
  el.id = "liner-audio";

  let src = "";
  let positionMs = 0;
  let positionAt = performance.now();
  let durationMs = NaN;
  let playing = false;
  let buffering = false;
  let ended = false;
  let wantPlay = false;
  let volume = 1;
  let rate = 1;
  let readyState = 0;
  let error: NativeMediaError | null = null;
  let loadToken = 0;
  /** where the next load starts (a reload after a seek mustn't restart the track) */
  let startAtMs = 0;

  const fire = (type: string) => el.dispatchEvent(new Event(type));
  const livePosition = () =>
    playing ? positionMs + (performance.now() - positionAt) * rate : positionMs;

  let playWhenReady = false;
  let seekable = true;
  let seekCheck: { target: number; at: number } | null = null;
  void LaneAudio.addListener("state", (s) => {
    // what the player reports right after a seek, for the log
    if (seekCheck && performance.now() - seekCheck.at > 600) {
      diag(`native after seek: at ${Math.round(s.positionMs / 1000)}s (wanted ${Math.round(seekCheck.target / 1000)}s)`);
      seekCheck = null;
    }
    const wasPlaying = playing;
    const wasActive = playWhenReady;
    const hadDuration = Number.isFinite(durationMs);
    // native ticks arrive every ~250 ms with a variable bridge delay; snapping
    // to each one makes the clock jitter back and forth (lyrics stutter, run
    // early / late). While playing steadily, keep the running clock unless it
    // has drifted noticeably; seeks, pauses and starts still snap.
    const now = performance.now();
    const running = playing && s.playing && !s.buffering;
    const expected = playing ? positionMs + (now - positionAt) * rate : positionMs;
    const drift = s.positionMs - expected;
    if (!running || Math.abs(drift) > 150) {
      positionMs = s.positionMs;
      positionAt = now;
    } else {
      // ease toward the native position: a quarter of the gap per tick
      positionMs = expected + drift * 0.25;
      positionAt = now;
    }
    seekable = s.seekable !== false;
    if (s.durationMs > 0 && s.durationMs !== durationMs) {
      durationMs = s.durationMs;
      if (!hadDuration) {
        readyState = 4;
        fire("loadedmetadata");
        fire("canplay");
      }
      fire("durationchange");
    }
    // "paused" follows the user's intent (playWhenReady), not whether sound is
    // coming out right now: buffering after a seek is not a pause
    playWhenReady = s.playWhenReady ?? s.playing;
    if (playWhenReady && !wasActive) fire("play");
    else if (!playWhenReady && wasActive && !s.ended) {
      wantPlay = false;
      fire("pause");
    }
    if (s.buffering && !buffering && playWhenReady) fire("waiting");
    buffering = s.buffering;
    playing = s.playing;
    if (playing && !wasPlaying) fire("playing");
    fire("timeupdate");
    if (s.ended && !ended) {
      ended = true;
      wantPlay = false;
      playWhenReady = false;
      fire("pause");
      fire("ended");
    }
    if (s.error && !error) {
      diag(`player: ${s.error}`);
      error = new NativeMediaError(2, s.error);
      fire("error");
    }
  });
  void LaneAudio.addListener("advanced", (a) => {
    diag(`native: moved on to the next track by itself (${a.trackId})`);
    // a new track is already playing natively: start the clock over
    positionMs = 0;
    positionAt = performance.now();
    durationMs = NaN;
    ended = false;
    error = null;
    readyState = 0;
    advancedHandler?.(a.trackId);
    fire("emptied");
  });
  void LaneAudio.addListener("remote", (r) => {
    if (r.action === "seeked") {
      diag(`native: seek landed at ${Math.round(r.positionMs / 1000)}s`);
      return;
    }
    if (r.action === "next" || r.action === "previous") diag(`native: "${r.action}" pressed, nothing queued natively`);
    if (r.action === "like") likeHandler?.();
    else if (r.action === "repeat") repeatHandler?.();
    else remoteHandler?.(r.action, r.positionMs);
  });

  const startLoad = async () => {
    const token = ++loadToken;
    positionMs = 0;
    positionAt = performance.now();
    durationMs = NaN;
    playing = false;
    playWhenReady = false;
    ended = false;
    error = null;
    readyState = 0;
    if (!src) {
      await LaneAudio.stop();
      return;
    }
    fire("loadstart");
    let url = src;
    try {
      if (src.startsWith("blob:")) {
        const blob: Blob = blobsByUrl.get(src) ?? (await fetch(src).then((r) => r.blob()));
        const ext = (blob.type.split("/")[1] || "bin").replace(/[^a-z0-9]/gi, "");
        const written = await LaneAudio.writeCacheFile({
          name: `track-${Date.now()}.${ext}`,
          base64: await blobToBase64(blob),
        });
        url = written.url;
      }
      if (token !== loadToken) return;
      const startPositionMs = startAtMs;
      startAtMs = 0;
      if (startPositionMs > 0) {
        diag(`load: starting at ${Math.round(startPositionMs / 1000)}s`);
        positionMs = startPositionMs;
      }
      await LaneAudio.load({
        url,
        headers: url.startsWith("http") ? headersForUrl(url) : {},
        ...nowPlaying,
        startPositionMs: Math.round(startPositionMs),
        autoplay: wantPlay,
      });
    } catch (e) {
      if (token !== loadToken) return;
      error = new NativeMediaError(4, e instanceof Error ? e.message : String(e));
      fire("error");
    }
  };

  const define = (name: string, get: () => unknown, set?: (v: never) => void) =>
    Object.defineProperty(el, name, { configurable: true, get, ...(set ? { set } : {}) });

  define("src", () => src, (v: string) => {
    src = v ?? "";
    void startLoad();
  });
  define("currentSrc", () => src);
  define("laneStartAt", () => startAtMs, (v: number) => {
    startAtMs = Math.max(0, Number(v) || 0);
  });
  define("currentTime", () => livePosition() / 1000, (v: number) => {
    if (!seekable) diag("seek: this stream reports itself as not seekable");
    diag(`native seek -> ${Math.round(v)}s (was ${Math.round(livePosition() / 1000)}s)`);
    seekCheck = { target: v * 1000, at: performance.now() };
    positionMs = Math.max(0, v * 1000);
    positionAt = performance.now();
    ended = false;
    fire("seeking");
    // whole ms: the native side reads an integer
    void LaneAudio.seek({ positionMs: Math.round(positionMs) }).then(() => fire("seeked"));
    fire("timeupdate");
  });
  define("duration", () => (Number.isFinite(durationMs) ? durationMs / 1000 : NaN));
  define("paused", () => !playWhenReady && !wantPlay);
  define("ended", () => ended);
  define("readyState", () => readyState);
  define("networkState", () => (buffering ? 2 : 1));
  define("error", () => error);
  define("buffered", () => ({ length: 0, start: () => 0, end: () => 0 }));
  define("volume", () => volume, (v: number) => {
    volume = Math.max(0, Math.min(1, v));
    void LaneAudio.setVolume({ volume });
    fire("volumechange");
  });
  define("playbackRate", () => rate, (v: number) => {
    rate = v || 1;
    void LaneAudio.setRate({ rate });
    fire("ratechange");
  });
  define("defaultPlaybackRate", () => 1, () => {});
  define("preservesPitch", () => true, () => {});

  (el as unknown as { play: () => Promise<void> }).play = async () => {
    wantPlay = true;
    ended = false;
    await LaneAudio.play();
  };
  (el as unknown as { pause: () => void }).pause = () => {
    wantPlay = false;
    void LaneAudio.pause();
  };
  (el as unknown as { load: () => void }).load = () => {
    void startLoad();
  };
  const removeAttribute = el.removeAttribute.bind(el);
  el.removeAttribute = (name: string) => {
    if (name === "src") {
      src = "";
      void startLoad();
      return;
    }
    removeAttribute(name);
  };

  return el;
}
