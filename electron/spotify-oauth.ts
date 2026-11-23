import { app, safeStorage, shell } from "electron";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

const CLIENT_ID = "9ec2cf6893ff411a8c7bef0fbc5a9fd2";
const PORT = 43821;
const CALLBACK = "/spotify/callback";
const REDIRECT_URI = `http://127.0.0.1:${PORT}${CALLBACK}`;
type Session = { access: string; refresh: string; expiresAt: number };
let current: Session | null = null;
let loginPending: Promise<boolean> | undefined;
let refreshPending: Promise<Session> | undefined;
let generation = 0;
const sessionFile = () => path.join(app.getPath("userData"), "spotify-oauth.enc");
const canPersist = () => safeStorage.isEncryptionAvailable()
  && (process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text");

async function getSession(): Promise<Session | null> {
  if (current || !canPersist()) return current;
  const epoch = generation;
  try {
    const saved = JSON.parse(safeStorage.decryptString(await readFile(sessionFile()))) as Partial<Session>;
    if (epoch === generation && saved.access && saved.refresh && Number.isFinite(saved.expiresAt)) current = saved as Session;
  } catch { /* no usable stored session */ }
  return current;
}

async function exchange(params: Record<string, string>, epoch: number, oldRefresh?: string): Promise<Session> {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
    body: new URLSearchParams({ client_id: CLIENT_ID, ...params }),
  });
  if (!response.ok) throw new Error(`Spotify authorization failed (${response.status})`);
  const data = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
  const refresh = data.refresh_token || oldRefresh;
  if (!data.access_token || !refresh || !data.expires_in || epoch !== generation) throw new Error("Spotify session unavailable");
  current = { access: data.access_token, refresh, expiresAt: Date.now() + data.expires_in * 1000 };
  if (canPersist()) await writeFile(sessionFile(), safeStorage.encryptString(JSON.stringify(current)), { mode: 0o600 }).catch(() => {});
  return current;
}

function authorize(): Promise<string | null> {
  const verifier = randomBytes(48).toString("base64url");
  const state = randomBytes(32).toString("hex");
  const authorizeUrl = new URL("https://accounts.spotify.com/authorize");
  authorizeUrl.search = new URLSearchParams({
    client_id: CLIENT_ID, response_type: "code", redirect_uri: REDIRECT_URI, state,
    code_challenge_method: "S256", code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    scope: "user-read-private user-library-read playlist-read-private playlist-read-collaborative",
  }).toString();
  const epoch = generation;
  return new Promise<string | null>((resolve, reject) => {
    let finished = false;
    const timer = setTimeout(() => finish(null), 180_000);
    function finish(code: string | null, error?: Error) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      server.close();
      if (error) reject(error);
      else resolve(code);
    }
    const server = createServer((req, res) => {
      let url: URL;
      try { url = new URL(req.url ?? "/", REDIRECT_URI); }
      catch { res.writeHead(400).end(); return; }
      const candidate = Buffer.from(url.searchParams.get("state") ?? "");
      const expected = Buffer.from(state);
      if (req.method !== "GET" || req.headers.host !== `127.0.0.1:${PORT}` || url.pathname !== CALLBACK) {
        res.writeHead(404).end();
        return;
      }
      if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) {
        res.writeHead(400).end("Invalid Spotify authorization state.");
        return;
      }
      const code = url.searchParams.get("code");
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" })
        .end(code ? "Spotify authorization received. Return to Lane." : "Spotify authorization cancelled. Return to Lane.");
      finish(code);
    });
    server.once("error", error => finish(null, error));
    server.listen(PORT, "127.0.0.1", () => {
      void shell.openExternal(authorizeUrl.toString()).catch(error => finish(null, error));
    });
  }).then(async code => {
    if (!code) return null;
    await exchange({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI, code_verifier: verifier }, epoch);
    return code;
  });
}

export const spotifyOAuthHasLogin = async () => Boolean(await getSession());
export function spotifyOAuthLogin() {
  return loginPending ??= authorize().then(Boolean).finally(() => { loginPending = undefined; });
}
export async function spotifyOAuthLogout() {
  generation++;
  current = null;
  await refreshPending?.catch(() => {});
  await unlink(sessionFile()).catch(() => {});
  return true;
}

async function accessToken(force = false): Promise<string> {
  const saved = await getSession();
  if (!saved) throw new Error("Sign in to Spotify first");
  if (!force && saved.expiresAt > Date.now() + 30_000) return saved.access;
  refreshPending ??= exchange({ grant_type: "refresh_token", refresh_token: saved.refresh }, generation, saved.refresh)
    .finally(() => { refreshPending = undefined; });
  return (await refreshPending).access;
}

export async function spotifyOAuthRead(pathname: string) {
  if (typeof pathname !== "string" || !/^\/(?:me|me\/tracks|albums\/[a-zA-Z0-9]+(?:\/tracks)?|playlists\/[a-zA-Z0-9]+\/(?:items|tracks))(?:\?limit=\d{1,2}&offset=\d{1,8})?$/.test(pathname)) {
    throw new Error("Unsupported Spotify API request");
  }
  const url = `https://api.spotify.com/v1${pathname}`;
  const send = (token: string) => fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    redirect: "error", signal: AbortSignal.timeout(20_000),
  });
  let response = await send(await accessToken());
  if (response.status === 401) {
    await response.body?.cancel();
    response = await send(await accessToken(true));
  }
  return { status: response.status, body: await response.text(), retryAfter: response.headers.get("retry-after") };
}
