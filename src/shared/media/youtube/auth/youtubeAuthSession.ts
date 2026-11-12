import { getTvOauthClient } from "./tvOauthClient";
import {
  pollTvDeviceToken,
  requestTvDeviceCode,
  type TvDeviceCode,
} from "./tvDeviceFlow";
import {
  refreshTvTokens,
  toAuthorizationHeader,
  YoutubeAuthError,
  type YoutubeAuthTokens,
} from "./tvTokens";
import { getAuthSession } from "@/shared/api/auth-session";
import { integrationOwner, readIntegration, writeIntegration, IntegrationSessionError } from "@/shared/api/integrationSessions";

const STORAGE_KEY = "liner_youtube_tv_session";
const AUTH_REVISION_KEY = "liner_youtube_auth_revision";
const PAGE_ID_STORAGE_KEY = "liner_youtube_page_id";
const REVOKE_URL = "https://www.youtube.com/o/oauth2/revoke";
const REFRESH_MARGIN_MS = 60_000;
const TERMINAL_REFRESH_ERRORS = new Set([
  "invalid_grant",
  "unauthorized_client",
]);

type MainYoutubeAuthBridge = NonNullable<
  NonNullable<Window["linerElectron"]>["youtubeAuthSession"]
>;

let session: YoutubeAuthTokens | null | undefined;
let pageId: string | null | undefined;
let pendingRefresh: Promise<YoutubeAuthTokens | null> | null = null;
let activeOwner = "";
let pendingSync: Promise<void> | null = null;
let revision = 0;
let generation = 0;

function ownerKey(): string {
  const auth = getAuthSession();
  return auth?.user?.id ? `${auth.authBackend ?? "legacy"}:${auth.user.id}` : "guest";
}

function scopedKey(key: string): string { return `${key}:${encodeURIComponent(activeOwner || ownerKey())}`; }

function ensureOwner(): void {
  const next = ownerKey();
  if (activeOwner === next) return;
  activeOwner = next;
  session = undefined;
  pageId = undefined;
  pendingRefresh = null;
  pendingSync = null;
  revision = 0;
  generation++;
  notifyChanged();
}

if (typeof window !== "undefined") {
  window.addEventListener("auth:changed", () => ensureOwner());
}

function readAuthRevision(): number {
  ensureOwner();
  try { return Number(globalThis.localStorage?.getItem(scopedKey(AUTH_REVISION_KEY)) || 0) || 0; }
  catch { return 0; }
}

function writeAuthRevision(revision: number): void {
  ensureOwner();
  try { globalThis.localStorage?.setItem(scopedKey(AUTH_REVISION_KEY), String(revision)); }
  catch {}
}

async function fetchAuthRevision(): Promise<number> {
  const { api } = await import("@/shared/api");
  const result = await api.getYoutubeAuthRevision();
  return Number(result.revision) || 0;
}

export function syncYoutubeAuthState(): Promise<void> {
  ensureOwner();
  const owner = integrationOwner();
  if (!owner) return Promise.resolve();
  if (pendingSync) return pendingSync;
  const started = generation;
  const task = (async () => {
    let remote;
    try {
      remote = await readIntegration("youtube", owner, revision);
    } catch (error) {
      // Older Workers only support propagating sign-out.
      if (!(error instanceof IntegrationSessionError) || error.status !== 404 || !owner.startsWith("liner:")) throw error;
      const legacy = await fetchAuthRevision();
      if (generation === started && integrationOwner() === owner && legacy > readAuthRevision()) {
        writeAuthRevision(legacy);
        storePageId(null);
        save(null);
      }
      return;
    }
    if (generation !== started || integrationOwner() !== owner || remote.revision < revision) return;
    if (remote.revision === 0) {
      const local = getYoutubeAuthTokens();
      if (!local) return;
      if (owner.startsWith("liner:")) {
        const legacy = await fetchAuthRevision();
        if (generation !== started || integrationOwner() !== owner) return;
        if (legacy > readAuthRevision()) {
          writeAuthRevision(legacy);
          storePageId(null);
          save(null);
          return;
        }
      }
      await publishSession(owner, 0, local, getYoutubePageId());
      return;
    }
    if (remote.revision === revision) return;
    applySharedSession(remote.revision, remote.session, remote.session?.pageId ?? null);
  })().finally(() => {
    if (pendingSync === task) pendingSync = null;
  });
  pendingSync = task;
  return task;
}

function applySharedSession(nextRevision: number, tokens: YoutubeAuthTokens | null, channel: string | null) {
  revision = nextRevision;
  generation++;
  storePageId(channel);
  save(tokens);
}

async function publishSession(owner: string, expected: number, tokens: YoutubeAuthTokens | null, channel: string | null) {
  const result = await writeIntegration("youtube", owner, {
    revision: expected, session: tokens ? { ...tokens, pageId: channel } : null,
  });
  if (integrationOwner() === owner && result.revision >= revision) {
    applySharedSession(result.revision, tokens, channel);
  }
}

function mainBridge(): MainYoutubeAuthBridge | null {
  if (typeof window === "undefined") return null;
  return window.linerElectron?.youtubeAuthSession ?? null;
}

function readLocal(): YoutubeAuthTokens | null {
  ensureOwner();
  try {
    const raw = globalThis.localStorage?.getItem(scopedKey(STORAGE_KEY));
    return raw ? (JSON.parse(raw) as YoutubeAuthTokens) : null;
  } catch {
    return null;
  }
}

function notifyChanged(): void {
  globalThis.dispatchEvent?.(new Event("youtube-auth:changed"));
}

function dropLocal(): void {
  ensureOwner();
  try {
    globalThis.localStorage?.removeItem(scopedKey(STORAGE_KEY));
  } catch {}
}

function load(): YoutubeAuthTokens | null {
  ensureOwner();
  const bridge = mainBridge();
  if (!bridge) return readLocal();
  let stored: YoutubeAuthTokens | null = null;
  try {
    stored = bridge.get(activeOwner || ownerKey()) as YoutubeAuthTokens | null;
  } catch (err) {
    console.error("[YouTube] reading the stored session failed:", err);
  }
  return stored;
}

function save(next: YoutubeAuthTokens | null): void {
  ensureOwner();
  session = next;
  const bridge = mainBridge();
  if (bridge) {
    dropLocal();
    void bridge
      .set(activeOwner || ownerKey(), next ? { ...next } : null)
      .catch((err) =>
        console.error("[YouTube] saving the session failed:", err),
      );
  } else {
    try {
      if (next)
        globalThis.localStorage?.setItem(scopedKey(STORAGE_KEY), JSON.stringify(next));
      else globalThis.localStorage?.removeItem(scopedKey(STORAGE_KEY));
    } catch {
      return;
    }
  }
  notifyChanged();
}

function storePageId(next: string | null): void {
  ensureOwner();
  pageId = next;
  try {
    if (next) globalThis.localStorage?.setItem(scopedKey(PAGE_ID_STORAGE_KEY), next);
    else globalThis.localStorage?.removeItem(scopedKey(PAGE_ID_STORAGE_KEY));
  } catch {
    return;
  }
}

export function getYoutubePageId(): string | null {
  ensureOwner();
  if (pageId === undefined) {
    try {
      pageId = globalThis.localStorage?.getItem(scopedKey(PAGE_ID_STORAGE_KEY)) ?? null;
    } catch {
      pageId = null;
    }
  }
  return pageId;
}

export function selectYoutubePageId(next: string | null): void {
  if (next === getYoutubePageId()) return;
  const owner = integrationOwner();
  const tokens = getYoutubeAuthTokens();
  if (!owner || !tokens || !revision) {
    storePageId(next);
    notifyChanged();
    return;
  }
  void publishSession(owner, revision, tokens, next).catch(() => syncYoutubeAuthState().catch(() => undefined));
}

export function getYoutubeSessionKey(): string | null {
  const tokens = getYoutubeAuthTokens();
  if (!tokens) return null;
  return `${tokens.refreshToken}:${getYoutubePageId() ?? ""}`;
}

export function getYoutubeAuthTokens(): YoutubeAuthTokens | null {
  ensureOwner();
  if (session === undefined) session = load();
  return session;
}

export function isYoutubeSignedIn(): boolean {
  return getYoutubeAuthTokens() !== null;
}

export function startYoutubeTvSignIn(
  signal?: AbortSignal,
): Promise<TvDeviceCode> {
  return getTvOauthClient(signal).then((client) =>
    requestTvDeviceCode(client, signal),
  );
}

export async function completeYoutubeTvSignIn(
  code: TvDeviceCode,
  signal?: AbortSignal,
): Promise<YoutubeAuthTokens> {
  const owner = integrationOwner();
  const remote = owner ? await readIntegration("youtube", owner).catch((error) => {
    if (error instanceof IntegrationSessionError && error.status === 404) return null;
    throw error;
  }) : null;
  const tokens = await pollTvDeviceToken(await getTvOauthClient(signal), code, signal);
  signal?.throwIfAborted();
  if (integrationOwner() !== owner) throw new YoutubeAuthError("account_changed");
  if (owner && remote) {
    try {
      await publishSession(owner, remote.revision, tokens, null);
      return tokens;
    } catch (error) {
      if (!(error instanceof IntegrationSessionError) || error.status !== 503) throw error;
      // Keep existing local sign-in usable until the Worker key is configured.
    }
  }
  if (owner?.startsWith("liner:")) {
    const legacy = await fetchAuthRevision().catch(() => null);
    if (integrationOwner() !== owner) throw new YoutubeAuthError("account_changed");
    if (legacy !== null) writeAuthRevision(legacy);
  }
  applySharedSession(0, tokens, null);
  return tokens;
}

async function refresh(
  current: YoutubeAuthTokens,
  signal?: AbortSignal,
): Promise<YoutubeAuthTokens | null> {
  const owner = integrationOwner();
  const started = generation;
  const expected = revision;
  try {
    const next = await refreshTvTokens(await getTvOauthClient(signal), current.refreshToken, signal);
    if (generation !== started || integrationOwner() !== owner) return null;
    if (owner && expected && next.refreshToken !== current.refreshToken) {
      await publishSession(owner, expected, next, getYoutubePageId());
    } else {
      save(next);
    }
    return next;
  } catch (error) {
    if (error instanceof YoutubeAuthError && TERMINAL_REFRESH_ERRORS.has(error.code)
        && generation === started && integrationOwner() === owner) {
      if (owner && expected) {
        await publishSession(owner, expected, null, null).catch(() => syncYoutubeAuthState().catch(() => undefined));
      } else {
        applySharedSession(0, null, null);
      }
    }
    throw error;
  }
}

export async function getYoutubeAuthorization(
  signal?: AbortSignal,
): Promise<string | null> {
  const current = getYoutubeAuthTokens();
  if (!current) return null;
  if (current.expiresAt - REFRESH_MARGIN_MS > Date.now())
    return toAuthorizationHeader(current);
  if (!pendingRefresh) {
    const task = refresh(current, signal).finally(() => {
      if (pendingRefresh === task) pendingRefresh = null;
    });
    pendingRefresh = task;
  }
  const next = await pendingRefresh;
  return next ? toAuthorizationHeader(next) : null;
}

export async function signOutYoutube(): Promise<void> {
  const owner = integrationOwner();
  const current = getYoutubeAuthTokens();
  let clearedShared = false;
  if (owner) {
    const remote = await readIntegration("youtube", owner).catch((error) => {
      if (error instanceof IntegrationSessionError && error.status === 404) return null;
      throw error;
    });
    if (remote) {
      if (remote.session && remote.session.refreshToken !== current?.refreshToken) {
        await syncYoutubeAuthState();
        return;
      }
      await publishSession(owner, remote.revision, null, null);
      clearedShared = true;
    } else if (owner.startsWith("liner:")) {
      const { api } = await import("@/shared/api");
      const result = await api.revokeYoutubeAuthOnOtherDevices();
      if (integrationOwner() !== owner) return;
      writeAuthRevision(Number(result.revision) || 0);
    }
  }
  if (integrationOwner() !== owner) return;
  if (!clearedShared) applySharedSession(revision, null, null);
  if (!current) return;
  await fetch(
    `${REVOKE_URL}?token=${encodeURIComponent(current.refreshToken)}`,
    {
      method: "POST",
    },
  ).catch(() => undefined);
}
