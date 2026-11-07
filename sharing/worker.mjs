import { schemaStatements } from "./schema.mjs";
import { isUserPlaylist, publicPlaylistSnapshot, renderSharePage, snapshotOf, validEntity, safeImage } from "./presentation.mjs";
import identity from "./app-identity.json" with { type: "json" };

const PUBLIC_ORIGIN = "https://lane-app.site";
const ACCOUNT_ORIGIN = "https://api.tryliner.fun";
const initializedDatabases = new WeakMap();
async function initializeDatabase(env) {
  const db = requireDatabase(env);
  let ready = initializedDatabases.get(db);
  if (!ready) {
    ready = db.batch(schemaStatements.map(sql => db.prepare(sql)));
    initializedDatabases.set(db, ready);
    ready.catch(() => initializedDatabases.delete(db));
  }
  await ready;
}
const MAX_BODY = 32 * 1024;
class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const error = (status, code, message) => { throw new HttpError(status, code, message); };
const json = (value, status = 200) => Response.json(value, { status, headers: { "cache-control": "no-store" } });
function accountOrigin(env) {
  const origin = new URL(env.ACCOUNT_API_ORIGIN || ACCOUNT_ORIGIN);
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.hostname === "lane-app.site") error(503, "CONFIGURATION_ERROR", "Invalid account service configuration.");
  return origin;
}
async function accountRequest(env, path, authorization) {
  const headers = new Headers({ accept: "application/json", "user-agent": identity.userAgent });
  if (authorization) headers.set("authorization", authorization);
  if (!env.signRequest) error(503, "CONFIGURATION_ERROR", "Account signer is unavailable.");
  for (const [key, value] of Object.entries(env.signRequest("GET", path, ""))) headers.set(key, value);
  const response = await fetch(new URL(path, accountOrigin(env)), { headers, redirect: "manual", signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    if ([401, 403, 404].includes(response.status)) error(response.status, "ACCOUNT_ACCESS_DENIED", "Account or playlist is unavailable.");
    error(502, "ACCOUNT_SERVICE_UNAVAILABLE", "Account service is temporarily unavailable.");
  }
  return response.json();
}
async function authenticatedUser(request, env) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.match(/^Bearer\s+\S+$/i)) error(401, "UNAUTHORIZED", "Sign in to share.");
  const user = await accountRequest(env, "/v1/me", authorization);
  if (!user || typeof user.id !== "string" || !user.id || user.id.length > 200) error(502, "ACCOUNT_SERVICE_UNAVAILABLE", "Invalid account response.");
  return { user, authorization };
}
function requireDatabase(env) {
  if (!env.DB) error(503, "DATABASE_NOT_CONFIGURED", "Bind the Lane D1 database first.");
  return env.DB;
}
async function readBody(request) {
  if (Number(request.headers.get("content-length")) > MAX_BODY) error(413, "BODY_TOO_LARGE", "Request is too large.");
  const reader = request.body?.getReader();
  if (!reader) error(400, "INVALID_INPUT", "Expected JSON.");
  let text = "", size = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); error(413, "BODY_TOO_LARGE", "Request is too large."); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const result = JSON.parse(text);
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error();
    return result;
  } catch (cause) {
    if (cause instanceof HttpError) throw cause;
    error(400, "INVALID_INPUT", "Expected a JSON object.");
  } finally { reader.releaseLock(); }
}
async function publicPlaylist(env, id) {
  const row = await requireDatabase(env).prepare("SELECT * FROM public_playlists WHERE id=?").bind(id).first();
  if (!row) error(404, "NOT_FOUND", "Playlist is unavailable.");
  // Check the live public list on every read. No account tokens are saved in D1.
  const list = await accountRequest(env, `/v1/users/${encodeURIComponent(row.owner_id)}/playlists`);
  if (!Array.isArray(list.items) || !list.items.some(item => item.id === id && item.isPublic === true)) error(404, "NOT_FOUND", "Playlist is no longer public.");
  return JSON.parse(row.document_json);
}
function sanitizedPlaylist(detail, ownerId) {
  const playlist = detail?.playlist;
  if (!playlist || playlist.isPublic !== true || (playlist.ownerId && playlist.ownerId !== ownerId)) error(404, "NOT_FOUND", "Only public playlists can be shared.");
  if (!Array.isArray(detail.items)) error(502, "INVALID_PLAYLIST", "Invalid playlist response.");
  const snapshot = publicPlaylistSnapshot({ title: playlist.title, description: playlist.description });
  const safePlaylist = { id: playlist.id, title: snapshot.title, description: snapshot.subtitle + (snapshot.coverUrl ? `\n⁣lane-cover:${snapshot.coverUrl}` : ""), isPublic: true, ownerId,
    revision: playlist.revision, createdAt: playlist.createdAt, updatedAt: playlist.updatedAt };
  const items = detail.items.filter(item => item?.track?.id && !item.track.id.startsWith("local:")).map(item => {
    const track = item.track;
    return { id: item.id, position: item.position, addedAt: item.addedAt, track: {
      id: track.id, title: String(track.title || "").slice(0, 300), durationMs: Number(track.durationMs) || 0,
      artists: Array.isArray(track.artists) ? track.artists.slice(0, 30).map(artist => ({ id: artist.id, name: String(artist.name || "").slice(0, 300) })) : [],
      ...(track.cover?.url && safeImage(track.cover.url) ? { cover: { url: safeImage(track.cover.url) } } : {}),
      ...(track.album ? { album: { id: track.album.id, title: String(track.album.title || "").slice(0, 300) } } : {}),
    } };
  });
  const result = { playlist: safePlaylist, items };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 900_000) error(413, "PLAYLIST_TOO_LARGE", "Playlist is too large to share.");
  return result;
}
async function createShare(request, env) {
  const body = await readBody(request);
  if (!validEntity(body.type, body.entityId)) error(400, "INVALID_INPUT", "This item cannot be shared.");
  const db = requireDatabase(env);
  const { user, authorization } = await authenticatedUser(request, env);
  let snapshot = snapshotOf(body.snapshot);
  let playlistDocument;
  if (body.type === "playlist" && isUserPlaylist(body.entityId)) {
    const existing = await db.prepare("SELECT * FROM public_playlists WHERE id=?").bind(body.entityId).first();
    if (existing && existing.owner_id !== user.id) {
      const document = await publicPlaylist(env, body.entityId);
      snapshot = publicPlaylistSnapshot({ title: document.playlist.title, description: document.playlist.description });
    } else {
      const detail = await accountRequest(env, `/v1/me/playlists/${encodeURIComponent(body.entityId)}`, authorization);
      if (detail?.playlist?.id !== body.entityId) error(502, "INVALID_PLAYLIST", "Playlist ID mismatch.");
      playlistDocument = sanitizedPlaylist(detail, user.id);
      snapshot = publicPlaylistSnapshot({ title: detail.playlist.title, description: detail.playlist.description });
    }
  }
  if (!snapshot.title) error(400, "INVALID_INPUT", "A title is required.");
  const id = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const sender = { username: typeof user.username === "string" ? user.username.slice(0, 200) : "", displayName: typeof user.displayName === "string" ? user.displayName.slice(0, 300) : "" };
  const now = Math.floor(Date.now() / 1000);
  const commands = [];
  if (playlistDocument) commands.push(db.prepare("INSERT INTO public_playlists(id,owner_id,document_json) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET document_json=excluded.document_json").bind(body.entityId, user.id, JSON.stringify(playlistDocument)));
  // Conditional insertion keeps the hourly limit atomic even for concurrent requests.
  const insert = db.prepare("INSERT INTO shared_links(id,sender_id,sender_json,entity_type,entity_id,snapshot_json,created_at) SELECT ?,?,?,?,?,?,? WHERE (SELECT count(*) FROM shared_links WHERE sender_id=? AND created_at>?)<100").bind(id, user.id, JSON.stringify(sender), body.type, body.entityId, JSON.stringify(snapshot), now, user.id, now - 3600);
  commands.push(insert);
  const results = await db.batch(commands);
  if (!results.at(-1)?.meta?.changes) error(429, "RATE_LIMITED", "Too many links. Try again later.");
  return json({ id, url: `${PUBLIC_ORIGIN}/s/${id}` }, 201);
}
async function loadShare(env, id) {
  const row = await requireDatabase(env).prepare("SELECT * FROM shared_links WHERE id=?").bind(id).first();
  if (!row) error(404, "NOT_FOUND", "Link is unavailable.");
  let snapshot = JSON.parse(row.snapshot_json);
  if (row.entity_type === "playlist" && isUserPlaylist(row.entity_id)) {
    const document = await publicPlaylist(env, row.entity_id);
    snapshot = publicPlaylistSnapshot({ title: document.playlist.title, description: document.playlist.description });
  }
  return { id: row.id, type: row.entity_type, entityId: row.entity_id, snapshot, sender: JSON.parse(row.sender_json) };
}
async function readShare(request, env, id, html) {
  const share = await loadShare(env, id);
  if (!html) return request.method === "HEAD" ? new Response(null, { headers: { "cache-control": "no-store" } }) : json(share);
  return new Response(request.method === "HEAD" ? null : renderSharePage(share, PUBLIC_ORIGIN), { headers: {
    "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'none'; img-src https:; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  } });
}
async function readThumbnail(request, env, id) {
  const share = await loadShare(env, id);
  const source = safeImage(share.snapshot.coverUrl);
  if (!source) error(404, "NOT_FOUND", "Cover is unavailable.");
  const cacheKey = new Request(`https://lane-app.site/__thumb-cache/${id}.jpg`);
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const cached = cache ? await cache.match(cacheKey) : null;
  if (cached) return request.method === "HEAD" ? new Response(null, { status: cached.status, headers: cached.headers }) : cached;
  const transformed = await fetch(source, { cf: { image: { width: 480, height: 480, fit: "cover", format: "jpeg", quality: 78 } } });
  if (!transformed.ok || !transformed.headers.get("content-type")?.startsWith("image/")) error(502, "IMAGE_UNAVAILABLE", "Cover could not be prepared.");
  const response = new Response(request.method === "HEAD" ? null : transformed.body, { headers: {
    "content-type": "image/jpeg", "cache-control": "public, max-age=3600, s-maxage=86400", "x-content-type-options": "nosniff",
  } });
  if (cache) await cache.put(cacheKey, response.clone());
  return response;
}
async function handle(request, env) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (url.pathname === "/health") {
    await initializeDatabase(env);
    return json({ service: "lane-share", database: true });
  }
  if (url.pathname === "/v1/shares" || /^\/(?:s|thumb|v1\/public\/(?:shares|playlists))\//.test(url.pathname)) await initializeDatabase(env);
  if (url.pathname === "/.well-known/assetlinks.json" && ["GET", "HEAD"].includes(request.method)) {
    const fingerprints = (env.ANDROID_SHA256_FINGERPRINTS || "").split(",").map(value => value.trim()).filter(Boolean);
    if (!fingerprints.length || fingerprints.some(value => !/^(?:[A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/.test(value))) return new Response("Android certificate fingerprint is not configured", { status: 503 });
    return new Response(request.method === "HEAD" ? null : JSON.stringify([{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: "com.therikky.lane", sha256_cert_fingerprints: fingerprints } }]), { headers: { "content-type": "application/json", "cache-control": "public, max-age=300" } });
  }
  if (url.pathname === "/" && ["GET", "HEAD"].includes(request.method)) return new Response(request.method === "HEAD" ? null : '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lane — музыка рядом</title><style>body{background:#0d0d10;color:#eee;font:18px system-ui;display:grid;place-items:center;min-height:90vh;padding:24px}main{max-width:500px}a{color:#d6b4ff;line-height:2}p{color:#aaa;line-height:1.6}</style><main><h1>Lane</h1><p>Слушайте музыку и делитесь любимыми треками, альбомами, исполнителями и плейлистами.</p><a href="https://github.com/therikky-lk/lanes-app/releases/latest">Скачать Lane →</a></main></html>', { headers: { "content-type": "text/html; charset=utf-8" } });
  if (url.pathname === "/v1/shares" && request.method === "POST") return createShare(request, env);
  if (url.pathname === "/v1/shares") return json({ code: "METHOD_NOT_ALLOWED" }, 405);
  const thumbnailMatch = url.pathname.match(/^\/thumb\/([A-Za-z0-9_-]{22})\.jpg$/);
  if (thumbnailMatch && ["GET", "HEAD"].includes(request.method)) return readThumbnail(request, env, thumbnailMatch[1]);
  const match = url.pathname.match(/^\/(s|v1\/public\/shares)\/([A-Za-z0-9_-]{22})$/);
  if (match && ["GET", "HEAD"].includes(request.method)) return readShare(request, env, match[2], match[1] === "s");
  const playlistMatch = url.pathname.match(/^\/v1\/public\/playlists\/([A-Za-z0-9_-]{8,100})$/);
  if (playlistMatch && request.method === "GET") return json(await publicPlaylist(env, playlistMatch[1]));
  // Never forward a malformed share request or let it reach an unrelated API route.
  if (/^\/v1\/(?:public\/(?:shares|playlists)|shares)(?:\/|$)/.test(url.pathname) || url.pathname.startsWith("/s/")) return json({ code: "NOT_FOUND" }, 404);
  if (!url.pathname.startsWith("/v1/")) return new Response("Not found", { status: 404 });
  // Existing Lane account/catalog API remains available through the same domain.
  // Its origin is fixed in configuration, never supplied by a visitor.
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("user-agent", identity.userAgent);
  const response = await fetch(new URL(url.pathname + url.search, accountOrigin(env)), { method: request.method, headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body, redirect: "manual", signal: AbortSignal.timeout(45000) });
  return new Response(response.body, response);
}
export default {
  async fetch(request, env) {
    let response;
    try { response = await handle(request, env); }
    catch (cause) {
      const known = cause instanceof HttpError;
      response = json({ code: known ? cause.code : "SERVICE_UNAVAILABLE", message: known ? cause.message : "Lane sharing is temporarily unavailable." }, known ? cause.status : 503);
    }
    const result = new Response(response.body, response);
    result.headers.set("x-content-type-options", "nosniff");
    result.headers.set("access-control-allow-origin", "*");
    result.headers.set("access-control-allow-methods", "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS");
    result.headers.set("access-control-allow-headers", "Authorization,Content-Type,X-Request-Id,X-Client-Version,X-Platform,X-User-Id,X-User-Name,X-Session-Id,X-Liner-Signature,X-Liner-Timestamp,X-Liner-Nonce");
    if (!result.headers.has("cache-control")) result.headers.set("cache-control", "no-store");
    return result;
  },
};
