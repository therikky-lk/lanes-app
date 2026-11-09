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

/** Drop a device-local YouTube session when another signed-in device signs out. */
export async function syncYoutubeAuthState(): Promise<void> {
  const revision = await fetchAuthRevision();
  if (revision > readAuthRevision()) {
    writeAuthRevision(revision);
    if (getYoutubeAuthTokens()) save(null);
    else notifyChanged();
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
  storePageId(next);
  notifyChanged();
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
  const tokens = await pollTvDeviceToken(
    await getTvOauthClient(signal),
    code,
    signal,
  );
  try { writeAuthRevision(await fetchAuthRevision()); }
  catch { /* keep the last known revision when the API is temporarily offline */ }
  storePageId(null);
  save(tokens);
  return tokens;
}

async function refresh(
  current: YoutubeAuthTokens,
  signal?: AbortSignal,
): Promise<YoutubeAuthTokens | null> {
  try {
    const next = await refreshTvTokens(
      await getTvOauthClient(signal),
      current.refreshToken,
      signal,
    );
    save(next);
    return next;
  } catch (error) {
    if (
      error instanceof YoutubeAuthError &&
      TERMINAL_REFRESH_ERRORS.has(error.code)
    )
      save(null);
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
  pendingRefresh ??= refresh(current, signal).finally(() => {
    pendingRefresh = null;
  });
  const next = await pendingRefresh;
  return next ? toAuthorizationHeader(next) : null;
}

export async function signOutYoutube(): Promise<void> {
  const current = getYoutubeAuthTokens();
  try {
    const { api } = await import("@/shared/api");
    const result = await api.revokeYoutubeAuthOnOtherDevices();
    writeAuthRevision(Number(result.revision) || 0);
  } catch (error) {
    console.warn("[YouTube] could not sync sign-out to other devices:", error);
  }
  storePageId(null);
  save(null);
  if (!current) return;
  await fetch(
    `${REVOKE_URL}?token=${encodeURIComponent(current.refreshToken)}`,
    {
      method: "POST",
    },
  ).catch(() => undefined);
}
