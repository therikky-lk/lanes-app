// Lane Connect: like Spotify Connect between the user's own devices.
//
// Exactly one device plays at a time. Every device broadcasts its playback
// state; when another device starts playing, the one that was playing pauses
// and becomes a "remote" for it: its player shows what plays over there and its
// controls (play/pause, next/previous, seek, volume) are forwarded there.
import { create } from "zustand";
import type { Track } from "@/shared/types";
import { isNativeApp } from "@/shared/platform/native";
import { diag } from "@/shared/platform/diag";
import { playerEngine, setRemoteHooks, usePlayerStore, type RemoteAction } from "@/features/player/engine/playerEngine";
import { deriveKeys, open, seal, type ConnectKeys } from "./connectCrypto";
import { openRelay, type Relay } from "./connectTransport";

const CODE_KEY = "lane_connect_code";
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
}

type Message =
  | { t: "hello"; from: ConnectDevice }
  | { t: "bye"; from: ConnectDevice }
  | { t: "state"; from: ConnectDevice; state: RemoteState }
  | { t: "cmd"; from: ConnectDevice; to: string; action: RemoteAction | { type: "transfer"; to: string } }
  | {
      t: "takeover";
      from: ConnectDevice;
      to: string;
      queue: WireTrack[];
      index: number;
      positionMs: number;
      playing: boolean;
      context: string | null;
    };

interface ConnectStore {
  code: string | null;
  online: boolean;
  me: ConnectDevice;
  devices: Record<string, ConnectDevice>;
  /** the device this one mirrors, when playback runs elsewhere */
  followingId: string | null;
  remote: RemoteState | null;
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
  code: readStorage(CODE_KEY),
  online: false,
  me: makeMe(),
  devices: {},
  followingId: null,
  remote: null,
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
let savedLocalVolume: number | null = null;
let volumeTimer: ReturnType<typeof setTimeout> | null = null;

async function send(message: Message): Promise<void> {
  if (!relay || !keys) return;
  try {
    await relay.publish(await seal(keys.key, message));
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
  };
}

function broadcastState(force = false): void {
  if (useConnectStore.getState().followingId) return;
  const state = localState();
  if (!state.track) return;
  // skip repeats: only changes of track / status / volume, or a jump in position
  const signature = `${state.track.id}|${state.status}|${state.volume.toFixed(2)}|${Math.round(state.positionMs / 4000)}`;
  if (!force && signature === lastBroadcast) return;
  lastBroadcast = signature;
  void send({ t: "state", from: me(), state });
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

function startTicker(): void {
  if (ticker) return;
  ticker = setInterval(() => {
    const { remote, followingId } = useConnectStore.getState();
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
  }
  applyRemote(state);
  startTicker();
}

function stopFollowing(): void {
  if (!useConnectStore.getState().followingId) return;
  useConnectStore.setState({ followingId: null, remote: null });
  stopTicker();
  const store = usePlayerStore.getState();
  if (savedLocalVolume !== null) store.setVolume(savedLocalVolume);
  savedLocalVolume = null;
  if (store.status === "playing" || store.status === "loading") store.setStatus("paused");
}

// ---- controls ---------------------------------------------------------------

function intercept(action: RemoteAction): boolean {
  const { followingId, remote } = useConnectStore.getState();
  if (!followingId) return false;
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

function runCommand(action: RemoteAction | { type: "transfer"; to: string }): void {
  switch (action.type) {
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
  const store = usePlayerStore.getState();
  if (!store.currentTrack) return;
  const start = Math.max(0, store.currentIndex);
  const queue = store.queue.slice(start, start + 12).map(toWire);
  const message: Message = {
    t: "takeover",
    from: me(),
    to: targetId,
    queue: queue.length ? queue : [toWire(store.currentTrack)],
    index: 0,
    positionMs: store.positionMs,
    playing: store.status === "playing" || store.status === "loading",
    context: store.playbackContext,
  };
  await send(message);
}

async function takeOver(message: Extract<Message, { t: "takeover" }>): Promise<void> {
  stopFollowing();
  const queue = message.queue.map(fromWire);
  const track = queue[message.index] ?? queue[0];
  if (!track) return;
  await playerEngine.playTrack(track, queue, message.context, null, message.index);
  if (message.positionMs > 3000) playerEngine.seek(message.positionMs);
  if (!message.playing) setTimeout(() => playerEngine.pause(), 400);
}

// ---- incoming ---------------------------------------------------------------

async function onRelayMessage(text: string): Promise<void> {
  if (!keys) return;
  const message = await open<Message>(keys.key, text);
  if (!message || !message.from || message.from.id === useConnectStore.getState().me.id) return;
  seen(message.from);
  const { followingId, me: self } = useConnectStore.getState();

  switch (message.t) {
    case "hello":
      if (!followingId) broadcastState(true);
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
      const local = usePlayerStore.getState();
      const playingHere = !followingId && (local.status === "playing" || local.status === "loading");
      if (message.state.status === "playing") {
        // the newest player wins: this device pauses and mirrors it
        follow(message.from.id, message.state);
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

export async function startConnect(): Promise<void> {
  stopConnect(false);
  const code = useConnectStore.getState().code;
  if (!code) return;
  keys = await deriveKeys(code);
  relay = openRelay(
    keys.topic,
    (text) => void onRelayMessage(text),
    (online) => {
      useConnectStore.setState({ online });
      if (online) void send({ t: "hello", from: me() });
    },
  );
  installHooks();
  unsubscribeStore = usePlayerStore.subscribe(() => broadcastState());
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
  stopFollowing();
  setRemoteHooks(null, null);
  useConnectStore.setState({ online: false, devices: {} });
}

export async function setPairingCode(code: string | null): Promise<void> {
  writeStorage(CODE_KEY, code);
  useConnectStore.setState({ code });
  if (code) await startConnect();
  else stopConnect();
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
