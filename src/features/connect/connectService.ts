// Lane Connect: like Spotify Connect between the user's own devices.
//
// Exactly one device plays at a time. Every device broadcasts its playback
// state; when another device starts playing, the one that was playing pauses
// and becomes a "remote" for it: its player shows what plays over there and its
// controls (play/pause, next/previous, seek, volume, picking a new track) are
// forwarded there.
//
// Who is "the player" is decided by an epoch: a hybrid logical clock
// (max(wall clock, highest epoch seen + 1)) taken whenever a device starts
// playing on its own or receives a hand-over. A device that is playing only
// yields to a playing device with a newer epoch, so stale or crossing
// messages can't make two devices play at once or bounce playback back and
// forth.
import { create } from "zustand";
import type { Track } from "@/shared/types";
import { isNativeApp } from "@/shared/platform/native";
import { diag } from "@/shared/platform/diag";
import { playerEngine, setRemoteHooks, usePlayerStore, type RemoteAction } from "@/features/player/engine/playerEngine";
import { deriveKeys, open, seal, type ConnectKeys } from "./connectCrypto";
import { openRelay, type Relay } from "./connectTransport";
import { useAuthStore } from "@/features/auth/store/authStore";
import { isLocalTrackId } from "@/shared/media/local/localTracks";

const DEVICE_ID_KEY = "lane_connect_device_id";
const DEVICE_NAME_KEY = "lane_connect_device_name";
const PRESENCE_TTL_MS = 150_000;
const HEARTBEAT_MS = 25_000;

export type DeviceKind = "phone" | "desktop";

export interface ConnectDevice {
  id: string;
  name: string;
  kind: DeviceKind;
  lastSeen: number;
}

interface WireTrack {
  id: string;
  title: string;
  artists: string;
  coverUrl: string;
  durationMs: number;
  explicit?: boolean;
  album?: { id: string; title: string };
  artistId?: string;
}

interface RemoteState {
  track: WireTrack | null;
  status: "playing" | "paused" | "loading" | "idle";
  positionMs: number;
  at: number;
  volume: number;
  /** when the sender became the player (see the epoch note at the top) */
  epoch?: number;
  /** grows with every state a device sends: relays can deliver out of order */
  seq?: number;
}

type Command = RemoteAction | { type: "transfer"; to: string };
type WireCommand =
  | Exclude<Command, { type: "load" }>
  | { type: "load"; queue: WireTrack[]; index: number; context: string | null };

type Message = { clock?: number } & (
  | { t: "hello"; from: ConnectDevice }
  | { t: "bye"; from: ConnectDevice }
  /** likes / playlists changed on the sender: refresh the library */
  | { t: "library"; from: ConnectDevice }
  | { t: "state"; from: ConnectDevice; state: RemoteState }
  | { t: "cmd"; from: ConnectDevice; to: string; action: WireCommand }
  | {
      t: "takeover";
      from: ConnectDevice;
      to: string;
      queue: WireTrack[];
      index: number;
      positionMs: number;
      at?: number;
      playing: boolean;
      context: string | null;
    }
);

interface ConnectStore {
  code: string | null;
  online: boolean;
  me: ConnectDevice;
  devices: Record<string, ConnectDevice>;
  /** the device this one mirrors, when playback runs elsewhere */
  followingId: string | null;
  remote: RemoteState | null;
  /** short id of the account channel, to compare between devices */
  fingerprint: string | null;
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
}

function defaultDeviceName(): string {
  const ua = navigator.userAgent;
  if (isNativeApp()) {
    const model = ua.match(/Android [\d.]+; ([^;)]+)/)?.[1]?.replace(/ Build.*$/, "").trim();
    return model && model !== "K" ? `Phone (${model})` : "Phone";
  }
  if (/Windows/i.test(ua)) return "PC (Windows)";
  if (/Mac OS/i.test(ua)) return "Mac";
  if (/Linux/i.test(ua)) return "PC (Linux)";
  return "Computer";
}

function makeMe(): ConnectDevice {
  let id = readStorage(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    writeStorage(DEVICE_ID_KEY, id);
  }
  return {
    id,
    name: readStorage(DEVICE_NAME_KEY) || defaultDeviceName(),
    kind: isNativeApp() ? "phone" : "desktop",
    lastSeen: Date.now(),
  };
}

export const useConnectStore = create<ConnectStore>(() => ({
  code: null,
  online: false,
  me: makeMe(),
  devices: {},
  followingId: null,
  remote: null,
  fingerprint: null,
}));

function toWire(track: Track): WireTrack {
  return {
    id: track.id,
    title: track.title,
    artists: track.artists,
    coverUrl: track.coverUrl,
    durationMs: track.durationMs,
    ...(track.explicit ? { explicit: true } : {}),
    ...(track.album ? { album: track.album } : {}),
    ...(track.artistId ? { artistId: track.artistId } : {}),
  };
}

function fromWire(track: WireTrack): Track {
  return { ...track, playCount: 0 };
}

let keys: ConnectKeys | null = null;
let relay: Relay | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let ticker: ReturnType<typeof setInterval> | null = null;
let unsubscribeStore: (() => void) | null = null;
let lastBroadcast = "";
let lastBroadcastState: RemoteState | null = null;
let broadcastTimer: ReturnType<typeof setTimeout> | null = null;
let savedLocalVolume: number | null = null;
let volumeTimer: ReturnType<typeof setTimeout> | null = null;
let handOverTimer: ReturnType<typeof setTimeout> | null = null;

// ---- epoch (hybrid logical clock) --------------------------------------------
let clock = 0; // highest epoch seen anywhere
let myEpoch = 0; // when this device last became the player

function observe(value: number | undefined): void {
  if (typeof value === "number" && Number.isFinite(value) && value > clock) clock = value;
}

function becomePlayer(): void {
  clock = Math.max(Date.now(), clock + 1);
  myEpoch = clock;
}

/** does a device playing with `epoch` win over this one playing? */
function theyWin(epoch: number | undefined, theirId: string): boolean {
  const e = epoch ?? 0;
  if (e !== myEpoch) return e > myEpoch;
  return theirId > useConnectStore.getState().me.id;
}

function isActive(status: string): boolean {
  return status === "playing" || status === "loading";
}

// ntfy turns messages over 4 KB into file attachments: keep them small
const MAX_SEALED = 3600;

async function fitQueue<M>(build: (queue: WireTrack[]) => M, queue: WireTrack[]): Promise<M> {
  let q = queue;
  let message = build(q);
  while (q.length > 1 && keys && (await seal(keys.key, message)).length > MAX_SEALED) {
    q = q.slice(0, -1);
    message = build(q);
  }
  return message;
}

/** the queue window from `index` on, as small wire tracks */
function queueWindow(queue: Track[], index: number): WireTrack[] {
  const start = Math.max(0, index);
  return queue.slice(start, start + 8).map(toWire);
}

let stateSeq = 0;
/** newest state seq seen per device */
const lastSeq = new Map<string, number>();
let lastRemoteUpdate = 0;
let lastStateNudge = 0;
let resendTimer: ReturnType<typeof setTimeout> | null = null;

async function send(message: Message): Promise<void> {
  if (!relay || !keys) return;
  if (message.t === "state") {
    stateSeq = Math.max(Date.now(), stateSeq + 1);
    message = { ...message, state: { ...message.state, seq: stateSeq } };
  }
  try {
    await relay.publish(await seal(keys.key, { ...message, clock }));
  } catch (error) {
    diag(`connect: send failed (${error instanceof Error ? error.message : String(error)})`);
  }
}

function me(): ConnectDevice {
  return { ...useConnectStore.getState().me, lastSeen: Date.now() };
}

function seen(device: ConnectDevice): void {
  if (device.id === useConnectStore.getState().me.id) return;
  useConnectStore.setState((s) => ({ devices: { ...s.devices, [device.id]: { ...device, lastSeen: Date.now() } } }));
}

/** what this device is playing right now (only meaningful when not following) */
function localState(): RemoteState {
  const p = usePlayerStore.getState();
  return {
    track: p.currentTrack ? toWire(p.currentTrack) : null,
    status: p.status === "error" ? "paused" : p.status,
    positionMs: p.positionMs,
    at: Date.now(),
    volume: p.volume,
    epoch: myEpoch,
  };
}

function broadcastState(force = false): void {
  if (useConnectStore.getState().followingId) return;
  const state = localState();
  if (!state.track) return;
  // Only real changes go out: track, status, volume, or a seek (the position
  // drifting from where followers would extrapolate it). Followers move the
  // position on their own, so a playing device doesn't need to keep publishing
  // (ntfy rate-limits chatty clients, and dropped messages are what desyncs).
  const signature = `${state.track.id}|${state.status}|${myEpoch}`;
  const prev = lastBroadcastState;
  const volumeChanged = !!prev && Math.abs(prev.volume - state.volume) > 0.005;
  const seeked = !!prev && Math.abs(livePosition(prev) - state.positionMs) > 2500;
  if (!force && signature === lastBroadcast && !volumeChanged && !seeked) return;
  const urgent = force || signature !== lastBroadcast || seeked;
  lastBroadcast = signature;
  lastBroadcastState = state;
  if (broadcastTimer) clearTimeout(broadcastTimer);
  broadcastTimer = null;
  if (urgent) {
    void send({ t: "state", from: me(), state });
    // a single dropped message must not leave the other device stuck on a
    // stale status: repeat the settled state once shortly after
    if (resendTimer) clearTimeout(resendTimer);
    resendTimer = setTimeout(() => {
      resendTimer = null;
      if (useConnectStore.getState().followingId) return;
      const settled = localState();
      if (!settled.track) return;
      lastBroadcastState = settled;
      void send({ t: "state", from: me(), state: settled });
    }, 1500);
  } else {
    // a volume slider fires many times a second: send the last value
    broadcastTimer = setTimeout(() => {
      broadcastTimer = null;
      if (useConnectStore.getState().followingId) return;
      const latest = localState();
      lastBroadcastState = latest;
      void send({ t: "state", from: me(), state: latest });
    }, 200);
  }
}

function onPlayerChange(state: { status: string }, prev: { status: string }): void {
  // playback started on this device by itself (not mirrored): newest player
  if (!useConnectStore.getState().followingId && isActive(state.status) && !isActive(prev.status)) becomePlayer();
  broadcastState();
}

// ---- following another device ---------------------------------------------

function applyRemote(state: RemoteState): void {
  const store = usePlayerStore.getState();
  const track = state.track ? fromWire(state.track) : null;
  if (track && store.currentTrack?.id !== track.id) {
    store.setQueue([track]);
    store.setCurrentTrack(track, 0);
  }
  if (!track) return;
  store.setDuration(track.durationMs || store.durationMs);
  store.setStatus(state.status === "idle" ? "paused" : state.status);
  const elapsed = state.status === "playing" ? Date.now() - state.at : 0;
  store.setPosition(Math.max(0, state.positionMs + elapsed));
  if (Math.abs(store.volume - state.volume) > 0.001) store.setVolume(state.volume);
}

// the lyrics view follows the <audio> element; while mirroring another device
// that element is idle here, so make it report the remote position instead
let restoreAudio: (() => void) | null = null;

function virtualizeAudio(on: boolean): void {
  const el = document.getElementById("liner-audio") as HTMLAudioElement | null;
  if (!el) return;
  if (on && !restoreAudio) {
    const names = ["currentTime", "paused"] as const;
    const saved = names.map((n) => [n, Object.getOwnPropertyDescriptor(el, n)] as const);
    Object.defineProperty(el, "currentTime", {
      configurable: true,
      get: () => {
        const r = useConnectStore.getState().remote;
        return r ? livePosition(r) / 1000 : 0;
      },
      set: () => {},
    });
    Object.defineProperty(el, "paused", {
      configurable: true,
      get: () => useConnectStore.getState().remote?.status !== "playing",
    });
    const timer = setInterval(() => el.dispatchEvent(new Event("timeupdate")), 250);
    restoreAudio = () => {
      clearInterval(timer);
      for (const [n, d] of saved) {
        if (d) Object.defineProperty(el, n, d);
        else delete (el as unknown as Record<string, unknown>)[n];
      }
    };
  } else if (!on && restoreAudio) {
    restoreAudio();
    restoreAudio = null;
  }
}

function startTicker(): void {
  if (ticker) return;
  ticker = setInterval(() => {
    const { remote, followingId } = useConnectStore.getState();
    // the player hasn't reported for a while after a change: ask for its state
    if (followingId && remote && remote.status === "loading" && Date.now() - lastRemoteUpdate > 3000 && Date.now() - lastStateNudge > 3000) {
      lastStateNudge = Date.now();
      void send({ t: "hello", from: me() });
    }
    if (!followingId || !remote || remote.status !== "playing") return;
    const store = usePlayerStore.getState();
    const pos = remote.positionMs + (Date.now() - remote.at);
    store.setPosition(Math.min(pos, store.durationMs || pos));
  }, 500);
}

function stopTicker(): void {
  if (ticker) clearInterval(ticker);
  ticker = null;
}

function follow(deviceId: string, state: RemoteState): void {
  const wasFollowing = useConnectStore.getState().followingId;
  // mark as following first so the pause below isn't broadcast as our state
  useConnectStore.setState({ followingId: deviceId, remote: state });
  if (!wasFollowing) {
    // this device was the player: go quiet, keep its volume for later
    const store = usePlayerStore.getState();
    savedLocalVolume = store.volume;
    if (store.status === "playing" || store.status === "loading") {
      setRemoteHooks(null, null);
      playerEngine.pause();
      installHooks();
    }
    virtualizeAudio(true);
  }
  applyRemote(state);
  startTicker();
}

function stopFollowing(): void {
  if (!useConnectStore.getState().followingId) return;
  useConnectStore.setState({ followingId: null, remote: null });
  stopTicker();
  virtualizeAudio(false);
  const store = usePlayerStore.getState();
  if (savedLocalVolume !== null) store.setVolume(savedLocalVolume);
  savedLocalVolume = null;
  if (store.status === "playing" || store.status === "loading") store.setStatus("paused");
}

// ---- controls ---------------------------------------------------------------

function intercept(action: RemoteAction): boolean {
  const { followingId, remote } = useConnectStore.getState();
  if (!followingId) return false;
  if (action.type === "load") return forwardLoad(followingId, action);
  // keep the mirrored UI snappy: apply the obvious part locally right away
  if (remote) {
    let next: RemoteState | null = null;
    if (action.type === "toggle") next = { ...remote, status: remote.status === "playing" ? "paused" : "playing", positionMs: livePosition(remote), at: Date.now() };
    if (action.type === "play") next = { ...remote, status: "playing", positionMs: livePosition(remote), at: Date.now() };
    if (action.type === "pause") next = { ...remote, status: "paused", positionMs: livePosition(remote), at: Date.now() };
    if (action.type === "seek") next = { ...remote, positionMs: action.positionMs, at: Date.now() };
    if (action.type === "volume") next = { ...remote, volume: action.volume };
    if (next) {
      useConnectStore.setState({ remote: next });
      applyRemote(next);
    }
  }
  if (action.type === "volume") {
    // a slider fires many times a second: send the last value
    if (volumeTimer) clearTimeout(volumeTimer);
    volumeTimer = setTimeout(() => void send({ t: "cmd", from: me(), to: followingId, action }), 180);
    return true;
  }
  void send({ t: "cmd", from: me(), to: followingId, action });
  return true;
}

/** a track picked here while mirroring plays on the device being mirrored */
function forwardLoad(targetId: string, action: Extract<RemoteAction, { type: "load" }>): boolean {
  const track = action.queue[action.index];
  // files added on this device exist only here: play those locally
  if (!track || isLocalTrackId(track.id)) return false;
  const upcoming = queueWindow(action.queue, action.index).filter((t) => !isLocalTrackId(t.id));
  const remote = useConnectStore.getState().remote;
  const optimistic: RemoteState = {
    track: toWire(track),
    status: "loading",
    positionMs: 0,
    at: Date.now(),
    volume: remote?.volume ?? usePlayerStore.getState().volume,
    epoch: remote?.epoch,
  };
  useConnectStore.setState({ remote: optimistic });
  applyRemote(optimistic);
  lastRemoteUpdate = Date.now();
  void fitQueue(
    (queue): Message => ({ t: "cmd", from: me(), to: targetId, action: { type: "load", queue, index: 0, context: action.context } }),
    upcoming.length ? upcoming : [toWire(track)],
  ).then(send);
  return true;
}

function livePosition(state: RemoteState): number {
  return state.status === "playing" ? state.positionMs + (Date.now() - state.at) : state.positionMs;
}

function onLocalPlay(): void {
  // something was started on this device: it becomes the player again
  stopFollowing();
}

function installHooks(): void {
  setRemoteHooks(intercept, onLocalPlay);
}

function runCommand(action: WireCommand): void {
  switch (action.type) {
    case "load": {
      const queue = action.queue.map(fromWire);
      const track = queue[action.index] ?? queue[0];
      if (track) void playerEngine.playTrack(track, queue, action.context, null, queue.indexOf(track));
      break;
    }
    case "toggle":
      playerEngine.togglePlayPause();
      break;
    case "play":
      playerEngine.resume();
      break;
    case "pause":
      playerEngine.pause();
      break;
    case "next":
      void playerEngine.skipNext(false);
      break;
    case "prev":
      void playerEngine.skipPrevious();
      break;
    case "seek":
      playerEngine.seek(action.positionMs);
      break;
    case "volume":
      playerEngine.setVolume(action.volume);
      break;
    case "transfer":
      void handOver(action.to);
      break;
  }
  setTimeout(() => broadcastState(true), 300);
}

/** move playback (queue, position) from this device to another one */
async function handOver(targetId: string): Promise<void> {
  if (useConnectStore.getState().followingId) return;
  const store = usePlayerStore.getState();
  const current = store.currentTrack;
  if (!current) return;
  const audioEl = document.getElementById("liner-audio") as HTMLAudioElement | null;
  const positionMs =
    store.status === "playing" && audioEl && !Number.isNaN(audioEl.currentTime)
      ? Math.round(audioEl.currentTime * 1000)
      : store.positionMs;
  const playing = isActive(store.status);
  const upcoming = queueWindow(store.queue, store.currentIndex).filter((t) => !isLocalTrackId(t.id));
  const at = Date.now();
  const message = await fitQueue(
    (queue): Message => ({
      t: "takeover",
      from: me(),
      to: targetId,
      queue,
      index: 0,
      positionMs,
      at,
      playing,
      context: store.playbackContext,
    }),
    upcoming.length ? upcoming : [toWire(current)],
  );
  // Stop here right away and mirror the target, instead of playing on until
  // its first state arrives (that gap is when both devices were playing).
  // epoch 0: the target's real state, with its fresh epoch, replaces this.
  follow(targetId, { track: toWire(current), status: playing ? "loading" : "paused", positionMs, at, volume: store.volume, epoch: 0 });
  await send(message);
  // the target never answered (offline, message lost): stop mirroring a guess
  if (handOverTimer) clearTimeout(handOverTimer);
  handOverTimer = setTimeout(() => {
    handOverTimer = null;
    const { followingId, remote } = useConnectStore.getState();
    if (followingId === targetId && remote?.epoch === 0) stopFollowing();
  }, 15_000);
}

async function takeOver(message: Extract<Message, { t: "takeover" }>): Promise<void> {
  stopFollowing();
  const queue = message.queue.map(fromWire);
  const track = queue[message.index] ?? queue[0];
  if (!track) return;
  becomePlayer();
  // the music kept going while the message travelled; clocks may differ a bit
  const transit = message.playing && message.at ? Math.min(Math.max(0, Date.now() - message.at), 10_000) : 0;
  const positionMs = message.positionMs + transit;
  await playerEngine.playTrack(track, queue, message.context, null, message.index);
  if (positionMs > 3000) playerEngine.seek(positionMs);
  if (!message.playing) setTimeout(() => playerEngine.pause(), 400);
  broadcastState(true);
}

// ---- incoming ---------------------------------------------------------------

async function onRelayMessage(text: string): Promise<void> {
  if (!keys) return;
  const message = await open<Message>(keys.key, text);
  if (!message || !message.from || message.from.id === useConnectStore.getState().me.id) return;
  observe(message.clock);
  if (message.t === "state") observe(message.state.epoch);
  seen(message.from);
  const { followingId, me: self } = useConnectStore.getState();

  switch (message.t) {
    case "hello":
      if (!followingId) broadcastState(true);
      break;
    case "library":
      // the server already has the change; give it a moment, then reload
      setTimeout(() => window.dispatchEvent(new Event("library:changed")), 600);
      break;
    case "bye":
      if (followingId === message.from.id) stopFollowing();
      useConnectStore.setState((s) => {
        const devices = { ...s.devices };
        delete devices[message.from.id];
        return { devices };
      });
      break;
    case "state": {
      const seq = message.state.seq ?? 0;
      if (seq && seq <= (lastSeq.get(message.from.id) ?? 0)) break; // older than what we have
      if (seq) lastSeq.set(message.from.id, seq);
      lastRemoteUpdate = Date.now();
      const local = usePlayerStore.getState();
      const playingHere = !followingId && isActive(local.status);
      const theirs = message.state;
      if (isActive(theirs.status)) {
        if (followingId === message.from.id) {
          useConnectStore.setState({ remote: theirs });
          applyRemote(theirs);
        } else if (playingHere) {
          // both playing: only the newer player keeps going
          if (theyWin(theirs.epoch, message.from.id)) follow(message.from.id, theirs);
          else broadcastState(true);
        } else if (!followingId || (theirs.epoch ?? 0) >= (useConnectStore.getState().remote?.epoch ?? 0)) {
          follow(message.from.id, theirs);
        }
      } else if (followingId === message.from.id) {
        useConnectStore.setState({ remote: message.state });
        applyRemote(message.state);
      } else if (!playingHere && !followingId && !local.currentTrack && message.state.track) {
        // nothing here yet: show what the other device has paused
        follow(message.from.id, message.state);
      }
      break;
    }
    case "cmd":
      if (message.to !== self.id || followingId) break;
      runCommand(message.action);
      break;
    case "takeover":
      if (message.to === self.id) void takeOver(message);
      break;
  }
}

// ---- lifecycle ----------------------------------------------------------------

let libraryTimer: ReturnType<typeof setTimeout> | null = null;
function onLibraryChange(): void {
  // several quick likes in a row: one message
  if (libraryTimer) clearTimeout(libraryTimer);
  libraryTimer = setTimeout(() => {
    libraryTimer = null;
    void send({ t: "library", from: me() });
  }, 400);
}

/** devices signed in to the same account find each other on their own */
function accountSecret(): string | null {
  // only the account id: it's the one field every device has from the start
  // (email / username may arrive later or be missing on a restored session)
  const user = useAuthStore.getState().user as { id?: string } | null;
  if (!user?.id) return null;
  return `lane-account:${user.id}`;
}

const MANUAL_CODE_KEY = "lane_connect_code";

/** a code typed on both devices wins over the account channel */
export function manualCode(): string | null {
  return readStorage(MANUAL_CODE_KEY);
}

export async function setManualCode(code: string | null): Promise<void> {
  writeStorage(MANUAL_CODE_KEY, code);
  await startConnect();
}

export async function startConnect(): Promise<void> {
  stopConnect(false);
  const manual = manualCode();
  const code = manual ? `lane-code:${manual}` : accountSecret();
  useConnectStore.setState({ code });
  if (!code) return;
  keys = await deriveKeys(code);
  useConnectStore.setState({ fingerprint: keys.topic.slice(5, 11) });
  relay = openRelay(
    keys.topic,
    (text) => void onRelayMessage(text),
    (online) => {
      if (online !== useConnectStore.getState().online) diag(`connect: relay ${online ? "connected" : "unreachable (ntfy.sh)"}`);
      useConnectStore.setState({ online });
      if (online) void send({ t: "hello", from: me() });
    },
  );
  installHooks();
  // already playing when Connect comes up: this device is the current player
  if (isActive(usePlayerStore.getState().status)) becomePlayer();
  unsubscribeStore = usePlayerStore.subscribe(onPlayerChange);
  window.addEventListener("library:local-change", onLibraryChange);
  heartbeat = setInterval(() => {
    const now = Date.now();
    useConnectStore.setState((s) => ({
      devices: Object.fromEntries(Object.entries(s.devices).filter(([, d]) => now - d.lastSeen < PRESENCE_TTL_MS)),
    }));
    const following = useConnectStore.getState().followingId;
    if (following && !useConnectStore.getState().devices[following]) stopFollowing();
    if (!useConnectStore.getState().followingId && usePlayerStore.getState().status === "playing") broadcastState(true);
    else void send({ t: "hello", from: me() });
  }, HEARTBEAT_MS);
}

export function stopConnect(sayBye = true): void {
  if (sayBye && relay) void send({ t: "bye", from: me() });
  relay?.close();
  relay = null;
  keys = null;
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
  unsubscribeStore?.();
  unsubscribeStore = null;
  window.removeEventListener("library:local-change", onLibraryChange);
  if (broadcastTimer) clearTimeout(broadcastTimer);
  broadcastTimer = null;
  if (resendTimer) clearTimeout(resendTimer);
  resendTimer = null;
  lastSeq.clear();
  lastBroadcast = "";
  lastBroadcastState = null;
  stopFollowing();
  setRemoteHooks(null, null);
  useConnectStore.setState({ online: false, devices: {} });
}

export function setDeviceName(name: string): void {
  const clean = name.trim().slice(0, 40);
  writeStorage(DEVICE_NAME_KEY, clean || null);
  useConnectStore.setState((s) => ({ me: { ...s.me, name: clean || defaultDeviceName() } }));
  void send({ t: "hello", from: me() });
}

/** play on `deviceId` from here: either hand our playback over, or ask the
 *  device that's playing to move it */
export function transferTo(deviceId: string): void {
  const { followingId, me: self } = useConnectStore.getState();
  if (deviceId === self.id) {
    if (followingId) void send({ t: "cmd", from: me(), to: followingId, action: { type: "transfer", to: self.id } });
    return;
  }
  if (followingId) {
    void send({ t: "cmd", from: me(), to: followingId, action: { type: "transfer", to: deviceId } });
  } else {
    void handOver(deviceId);
  }
}
