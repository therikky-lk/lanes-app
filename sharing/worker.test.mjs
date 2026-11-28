import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { webcrypto } from "node:crypto";
import worker from "./worker.mjs";
import { createSigner } from "./upstream-signer.mjs";
import { sqliteD1 } from "./testing/sqlite-d1.mjs";
import { publicPlaylistSnapshot, renderSharePage, snapshotOf, validEntity } from "./presentation.mjs";
import { profileImage } from "./profile-presentation.mjs";
import { profileStats } from "./account-profile-stats.mjs";
import { profileRelation, writeProfileRelation } from "./account-profile-relations.mjs";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const module = new WebAssembly.Module(readFileSync(new URL("./signer.wasm", import.meta.url)));
const playlistId = "12345678-1234-1234-1234-123456789abc";
const request = (path, init) => new Request(`https://lane-app.site${path}`, init);
const input = { type: "track", entityId: "dQw4w9WgXcQ", snapshot: { title: "Song", subtitle: "Artist" }, senderId: "forged-user" };
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "lane-d1-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const state = { public: true, authorized: true, fail: false, profileStatus: 200, historyVisible: false, likesVisible: false, owner: "owner-id", avatar: "https://example.test/avatar.jpg", calls: [] };
  const fetch = mock.method(globalThis, "fetch", async (url, init) => {
    const path = new URL(url).pathname;
    state.calls.push({ url: String(url), path, init });
    assert.equal(new URL(url).origin, "https://api.tryliner.fun");
    if (state.fail) throw new Error("Temporary upstream failure");
    assert.ok(init.headers.get("user-agent").includes("lane/"));
    assert.ok(init.headers.get("x-liner-signature"));
    if (path === "/v1/me") return Response.json(state.authorized ? { id: init.headers.get("authorization") === "Bearer other-token" ? "other-id" : "owner-id", username: "alice", displayName: "Alice", email: "private@example.test", isPublic: state.public } : {}, { status: state.authorized ? 200 : 401 });
    if (path === "/v1/users/search") return Response.json([{ id: "owner-id", username: "alice", displayName: "Alice in Lane", isPublic: state.public }]);
    if (path === "/v1/users/owner-id" || path === "/v1/users/alice") return Response.json({ id: "owner-id", username: "alice", displayName: "Alice", bio: "Hello", avatarUrl: state.avatar, email: "private@example.test", isPublic: state.public, showHistory: state.historyVisible, showLikedTracks: state.likesVisible, listenedDurationMs: 5400000, likedTracksCount: 42, followersCount: 7 }, { status: state.profileStatus });
    if (path === `/v1/me/playlists/${playlistId}`) return Response.json({ playlist: { id: playlistId, title: "My public playlist", ownerId: state.owner, isPublic: state.public, description: "Hello⁣lane-local:secret-device-data⁣lane-cover:https://example.test/cover.jpg" }, items: [
      { id: "local-item", track: { id: "local:private", title: "Private file" } },
      { id: "item", position: 0, track: { id: "dQw4w9WgXcQ", title: "Song", artists: [{ id: "artist", name: "Artist" }], durationMs: 1000, privateProperty: "secret" } },
    ] });
    if (path === `/v1/users/owner-id/playlists`) return Response.json({ items: state.public ? [{ id: playlistId, isPublic: true }] : [] });
    return Response.json({ ok: true });
  });
  t.after(() => fetch.mock.restore());
  const env = { DB: sqliteD1(join(dir, "db.sqlite")), signRequest: createSigner(module) };
  const create = body => worker.fetch(request("/v1/shares", { method: "POST", headers: { authorization: "Bearer account-token", "content-type": "application/json" }, body: JSON.stringify(body) }), env);
  return { env, state, create };
}
test("creates tables and links in D1 without a separate server, using verified sender", async t => {
  const { env, create, state } = fixture(t);
  const response = await create(input);
  assert.equal(response.status, 201); const link = await response.json();
  assert.match(link.url, /^https:\/\/lane-app.site\/s\/[\w-]{22}$/);
  const publicResponse = await worker.fetch(request(`/v1/public/shares/${link.id}`), env);
  assert.equal(publicResponse.status, 200); const share = await publicResponse.json();
  assert.deepEqual(share.sender, { username: "alice", displayName: "Alice" });
  assert.ok(!JSON.stringify(share).includes("forged-user"));
  const stored = await env.DB.prepare("SELECT * FROM shared_links WHERE id=?").bind(link.id).first();
  assert.equal(stored.sender_id, "owner-id"); assert.ok(!JSON.stringify(stored).includes("account-token")); assert.ok(!JSON.stringify(stored).includes("private@example.test"));
  assert.equal(state.calls[0].path, "/v1/me");
});
test("username lookup only exposes exact public profiles", async t => {
  const { state, env } = fixture(t);
  const lookup = (username, exact = "1") => worker.fetch(request(`/v1/public/profile-by-username?${new URLSearchParams({ username, exact })}`), env);
  const response = await lookup("alice");
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.profile.username, "alice");
  assert.equal(result.entityId, "liner:owner-id");
  assert.equal(result.profile.email, undefined);
  assert.equal((await lookup("owner-id")).status, 404);
  assert.equal((await lookup("Alice in")).status, 404);
  const byName = await lookup("Alice in", "0");
  assert.equal(byName.status, 200);
  assert.equal((await byName.json()).profile.username, "alice");
  state.public = false;
  assert.equal((await lookup("alice")).status, 404);
  assert.equal((await lookup("Alice in", "0")).status, 404);
});

test("track comments require authentication to read and are removable only by their verified author", async t => {
  const { env, state } = fixture(t);
  const path = `/v1/track-comments/${input.entityId}`;
  const call = (route, method = "GET", token, body) => worker.fetch(request(route, { method,
    headers: token ? { authorization: `Bearer ${token}` } : {}, body: body && JSON.stringify(body) }), env);
  const post = (text, token) => call(path, "POST", token, { text, author: "forged", owner: "forged" });
  assert.equal((await post("hi")).status, 401);
  assert.equal((await post("  ", "account-token")).status, 400);
  assert.equal((await post("x".repeat(501), "account-token")).status, 400);
  assert.equal((await call("/v1/track-comments/local:private")).status, 404);
  const created = await post("  Great track!  ", "account-token");
  assert.equal(created.status, 201);
  const item = await created.json();
  assert.deepEqual(item, { id: item.id, author: "Alice", text: "Great track!", createdAt: item.createdAt, mine: true, legacyAvatar: true });
  const guest = await call(path);
  assert.equal(guest.status, 401);
  assert.ok(!(await guest.text()).includes(item.text));
  state.authorized = false;
  assert.equal((await call(path, "GET", "invalid-token")).status, 401);
  state.authorized = true;
  const member = await call(path, "GET", "other-token");
  assert.equal(member.headers.get("cache-control"), "no-store");
  assert.deepEqual(await member.json(), { items: [{ ...item, mine: false }], next: null });
  assert.deepEqual(await (await call(path, "GET", "account-token")).json(), { items: [item], next: null });
  assert.deepEqual(await (await call("/v1/track-comments/sc:42", "GET", "account-token")).json(), { items: [], next: null });
  assert.equal((await call(`${path}/${item.id}`, "DELETE", "other-token")).status, 404);
  assert.equal((await call(`${path}/${item.id}`, "DELETE", "account-token")).status, 200);
  assert.deepEqual(await (await call(path, "GET", "account-token")).json(), { items: [], next: null });
  for (let index = 0; index < 4; index++) assert.equal((await post(`Comment ${index}`, "account-token")).status, 201);
  assert.equal((await post("Flood", "account-token")).status, 429);
});

test("track comments use a stable cursor to load older comments", async t => {
  const { env } = fixture(t);
  const path = "/v1/track-comments/au:demo";
  const get = (route, token = "account-token") => worker.fetch(request(route, { headers: token ? { authorization: `Bearer ${token}` } : {} }), env);
  await get(path);
  await env.DB.batch(Array.from({ length: 34 }, (_, i) => env.DB.prepare(
    "INSERT INTO track_comments(track_id,owner,author_name,body,created_at) VALUES(?,?,?,?,?)"
  ).bind("au:demo", "owner", "Author", String(i), 1)));
  const first = await (await get(path)).json();
  assert.equal(first.items.length, 30);
  assert.equal(first.items[0].text, "33");
  assert.equal((await get(`${path}?before=${first.next}`, null)).status, 401);
  const second = await (await get(`${path}?before=${first.next}`)).json();
  assert.deepEqual(second.items.map(item => item.text), ["3", "2", "1", "0"]);
  assert.equal(second.next, null);
  assert.equal((await get(`${path}?before=-1`)).status, 400);
});

test("rectangular comment photos and author profiles stay behind authentication and deleted comments lose assets", async t => {
  const { env } = fixture(t);
  const path = "/v1/track-comments/au:demo";
  const headers = { authorization: "Bearer account-token" };
  const call = (path, options = {}) => worker.fetch(request(path, options), env);
  const jpegHeader = Buffer.from([255,216,255,192,0,11,8,2,0,1,0,1,1,17,0,255,217]);
  const photo = jpegHeader.toString("base64");
  const post = photo => call(path, { method: "POST", headers, body: JSON.stringify({ photo }) });
  const oversized = Buffer.from(jpegHeader);
  oversized[8] = 1;
  assert.equal((await post(oversized.toString("base64"))).status, 400);
  const response = await post(photo);
  assert.equal(response.status, 201);
  const item = await response.json();
  assert.equal(item.hasPhoto, true);
  assert.equal(item.text, "");
  assert.equal(item.photo, undefined);
  const resource = `${path}/${item.id}`;
  assert.equal((await call(`${resource}/photo`)).status, 401);
  assert.equal((await call(`${resource}/profile`)).status, 401);
  assert.deepEqual(await (await call(`${resource}/photo`, { headers })).json(), { photo });
  assert.equal((await (await call(`${resource}/profile`, { headers })).json()).profile.displayName, "Alice");
  assert.equal((await call(resource, { method: "DELETE", headers })).status, 200);
  assert.equal((await call(`${resource}/photo`, { headers })).status, 404);
  assert.equal(await env.DB.prepare("SELECT * FROM track_comment_assets WHERE comment_id=?").bind(item.id).first(), null);
});

test("account profile aggregates use full-history SUM for public profiles without publishing private lists", async () => {
  const calls = [];
  const database = { query: async (sql, values) => {
    calls.push({ sql, values });
    return { rows: [{ listened_ms: "5400000", liked_count: "42" }] };
  } };
  const user = { id: "owner", is_public: false, show_history: false, show_liked_tracks: false };
  assert.deepEqual(await profileStats(database, user, "owner"), { listenedDurationMs: 5400000, likedTracksCount: 42 });
  assert.deepEqual(calls.at(-1).values, ["owner", true, true]);
  assert.match(calls.at(-1).sql, /SUM\(played_duration_ms\)/);
  assert.match(calls.at(-1).sql, /COUNT\(\*\) FROM liked_tracks/);
  assert.match(calls.at(-1).sql, /CURRENT_TIMESTAMP/);
  assert.deepEqual(await profileStats(database, user, "visitor"), { listenedDurationMs: null, likedTracksCount: null });
  assert.deepEqual(calls.at(-1).values, ["owner", false, false]);
  assert.deepEqual(await profileStats(database, { ...user, is_public: true }, null), { listenedDurationMs: 5400000, likedTracksCount: 42 });
});

test("public profiles show aggregate counters even when history and liked lists are hidden", async t => {
  const { env, create, state } = fixture(t);
  const link = await (await create({ type: "profile", entityId: "liner:owner-id" })).json();
  const read = async () => (await worker.fetch(request(`/v1/public/shares/${link.id}`), env)).json();
  let share = await read();
  assert.equal(share.profile.authBackend, "liner");
  assert.equal(share.profile.followersCount, 7);
  assert.equal(share.profile.listenedDurationMs, 5400000);
  assert.equal(share.profile.likedTracksCount, 42);
  assert.equal(share.profile.history, undefined);
  assert.equal(share.profile.likedTracks, undefined);
  state.historyVisible = true; state.likesVisible = true;
  share = await read();
  assert.equal(share.profile.listenedDurationMs, 5400000);
  assert.equal(share.profile.likedTracksCount, 42);
});

test("relationship snapshots bypass stale query caching and return real subscription state and counts", async () => {
  const calls = [];
  let following = false;
  const database = { query: async (sql, values) => {
    calls.push({ sql, values });
    return { rows: [{ is_following: following, followers: following ? 8 : 7, following: 3, observed_at: new Date("2026-11-22T20:00:00Z") }] };
  } };
  assert.equal((await profileRelation(database, "owner", "viewer")).is_following, false);
  following = true;
  const next = await profileRelation(database, "owner", "viewer");
  assert.equal(next.is_following, true);
  assert.equal(next.followers, 8);
  assert.equal(next.observedAt, "2026-11-22T20:00:00.000Z");
  assert.match(calls[0].sql, /SELECT CURRENT_TIMESTAMP AS observed_at/);
  assert.deepEqual(calls[0].values.slice(0, 2), ["owner", "viewer"]);
  assert.notEqual(calls[0].values[2], calls[1].values[2]);
});

test("unfollow returns the result of the write without a separate cached read", async () => {
  const calls = [];
  const db = { query: async (sql, values) => {
    calls.push({ sql, values });
    return { rows: [{ followers: 0, observed_at: new Date("2026-11-28T10:00:00Z") }] };
  } };
  const state = await writeProfileRelation(db, "owner", "viewer", false);
  assert.deepEqual(state, { isFollowing: false, followersCount: 0, relationshipUpdatedAt: "2026-11-28T10:00:00.000Z" });
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /WITH changed AS \(DELETE .* RETURNING 1\)/);
  assert.deepEqual(calls[0].values, ["owner", "viewer"]);
});
test("rejects anonymous and invalid account sessions", async t => {
  const { env, create, state } = fixture(t);
  const anonymous = await worker.fetch(request("/v1/shares", { method: "POST", body: JSON.stringify(input) }), env);
  assert.equal(anonymous.status, 401); assert.equal(state.calls.length, 0);
  state.authorized = false; assert.equal((await create(input)).status, 401);
});
test("shares only your public profile using verified live data and revokes access when private", async t => {
  const { env, create, state } = fixture(t);
  const body = { type: "profile", entityId: "liner:owner-id", snapshot: { title: "Forged profile" } };
  assert.equal((await create({ ...body, entityId: "liner:someone-else" })).status, 404);
  assert.equal((await create({ ...body, entityId: "hyprr:owner-id" })).status, 404);
  const response = await create(body);
  assert.equal(response.status, 201);
  const link = await response.json();
  const read = () => worker.fetch(request(`/v1/public/shares/${link.id}`), env);
  const share = await (await read()).json();
  assert.equal(share.type, "profile");
  assert.equal(share.snapshot.title, "Alice");
  assert.equal(share.profile.bio, "Hello");
  assert.ok(!JSON.stringify(share).includes("private@example.test"));
  assert.ok(!JSON.stringify(share).includes("account-token"));
  const page = await (await worker.fetch(request(`/s/${link.id}`), env)).text();
  assert.ok(page.includes('property="og:type" content="profile"'));
  assert.ok(page.includes("Hello"));
  state.fail = true;
  assert.equal((await read()).status, 503);
  state.fail = false;
  state.public = false;
  assert.equal((await create(body)).status, 404);
  assert.equal((await read()).status, 404);
  assert.equal((await worker.fetch(request(`/s/${link.id}`), env)).status, 404);
  assert.equal((await worker.fetch(request(`/thumb/${link.id}.jpg`), env)).status, 404);
});
test("keeps uploaded raster avatars in public profiles and serves preview images without HTTPS fetching", async t => {
  const { env, create, state } = fixture(t);
  state.avatar = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  const link = await (await create({ type: "profile", entityId: "liner:owner-id" })).json();
  const read = () => worker.fetch(request(`/v1/public/shares/${link.id}`), env);
  const share = await (await read()).json();
  assert.equal(share.profile.avatarUrl, state.avatar);
  const page = await worker.fetch(request(`/s/${link.id}`), env);
  assert.match(page.headers.get("content-security-policy"), /img-src https: data:/);
  assert.ok((await page.text()).includes(`src="${state.avatar}"`));
  const thumbnail = await worker.fetch(request(`/thumb/${link.id}.jpg`), env);
  assert.equal(thumbnail.status, 200);
  assert.equal(thumbnail.headers.get("content-type"), "image/gif");
  assert.equal(thumbnail.headers.get("cache-control"), "no-store");
  assert.deepEqual(new Uint8Array(await thumbnail.arrayBuffer()), Uint8Array.from(atob(state.avatar.split(",")[1]), char => char.charCodeAt(0)));
  assert.equal(await (await worker.fetch(request(`/thumb/${link.id}.jpg`, { method: "HEAD" }), env)).text(), "");
  state.public = false;
  assert.equal((await worker.fetch(request(`/thumb/${link.id}.jpg`), env)).status, 404);
});
test("private profiles show a friendly HTML page and a meaningful API error without account details", async t => {
  const { env, create, state } = fixture(t);
  const link = await (await create({ type: "profile", entityId: "liner:owner-id" })).json();
  for (const status of [200, 401, 403, 404]) {
    state.public = false; state.profileStatus = status;
    const page = await worker.fetch(request(`/s/${link.id}`), env);
    assert.equal(page.status, 404);
    assert.match(page.headers.get("content-type"), /text\/html/);
    assert.equal(page.headers.get("cache-control"), "no-store");
    const html = await page.text();
    assert.ok(html.includes("Профиль приватный или недоступен"));
    assert.ok(!html.includes("ACCOUNT_ACCESS_DENIED"));
    assert.ok(!html.includes("private@example.test"));
    assert.ok(!html.includes("Alice"));
    const api = await worker.fetch(request(`/v1/public/shares/${link.id}`), env);
    assert.equal(api.status, 404);
    assert.deepEqual(await api.json(), { code: "PROFILE_UNAVAILABLE", message: "Этот профиль приватный или недоступен." });
    const head = await worker.fetch(request(`/s/${link.id}`, { method: "HEAD" }), env);
    assert.equal(head.status, 404);
    assert.equal(await head.text(), "");
  }
});
test("profile image validation allows raster data and account-relative paths but rejects executable content", () => {
  assert.equal(profileImage("data:image/jpeg;base64,/9j/AAAA"), "data:image/jpeg;base64,/9j/AAAA");
  assert.equal(profileImage("/avatars/alice.jpg", "https://account.example"), "https://account.example/avatars/alice.jpg");
  for (const value of ["data:image/svg+xml;base64,PHN2Zz4=", "data:text/html;base64,PHN2Zz4=", "data:image/jpeg;base64,PHN2Zz4=", "data:image/gif;base64,broken", "javascript:alert(1)", "//evil.test/avatar.jpg", "https://user:password@example.test/image"]) {
    assert.equal(profileImage(value, "https://account.example"), "", value);
  }
});
test("profile cards show live banner and selected music without leaking history or private metadata", async t => {
  const { env, create, state } = fixture(t);
  const link = await (await create({ type: "profile", entityId: "liner:owner-id" })).json();
  const track = { id: "dQw4w9WgXcQ", title: '<script>alert("track")</script>', artists: "Artist", coverUrl: "", durationMs: 1000, playCount: 12, privateProperty: "private-history" };
  const artist = { id: "UCabcdefghijklmnopqrstuv", name: "Favorite artist", coverUrl: "https://example.test/artist.jpg" };
  const banner = "data:image/jpeg;base64,/9j/AAAA";
  const patch = body => worker.fetch(request("/v1/me/profile-customization/liner", { method: "PATCH", headers: { authorization: "Bearer account-token" }, body: JSON.stringify(body) }), env);
  assert.equal((await patch({ tracks: [track], banner })).status, 200);
  const share = await (await worker.fetch(request(`/v1/public/shares/${link.id}`), env)).json();
  assert.equal(share.profile.tracks[0].id, track.id);
  assert.equal(share.profile.artist, null);
  assert.equal(share.profile.banner, banner);
  assert.ok(!JSON.stringify(share).includes("private-history"));
  assert.equal(share.profile.tracks[0].playCount, 0);
  const html = await (await worker.fetch(request(`/s/${link.id}`), env)).text();
  assert.ok(html.includes("<h2>Любимый трек</h2>"));
  assert.ok(html.includes("Нажмите на трек, чтобы послушать его в Lane."));
  assert.ok(html.includes(`lane://track?id=${track.id}`));
  assert.ok(!html.includes(`lane://artist?id=${artist.id}`));
  assert.ok(html.includes(`src="${banner}"`));
  assert.ok(!html.includes('<script>alert("track")</script>'));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.equal((await patch({ artist })).status, 200);
  const artistHtml = await (await worker.fetch(request(`/s/${link.id}`), env)).text();
  assert.ok(artistHtml.includes(`lane://artist?id=${artist.id}`));
  assert.ok(artistHtml.includes("<h2>Любимый исполнитель</h2>"));
  assert.ok(artistHtml.includes("Нажмите на исполнителя, чтобы открыть его музыку в Lane."));
  assert.ok(!artistHtml.includes("Нажмите на трек"));
  assert.ok(!artistHtml.includes(`lane://track?id=${track.id}`));
  await patch({ artist: null, tracks: [] });
  const emptyHtml = await (await worker.fetch(request(`/s/${link.id}`), env)).text();
  assert.ok(emptyHtml.includes("Любимый трек или исполнитель пока не выбран."));
  assert.ok(!emptyHtml.includes(`lane://track?id=${track.id}`));
  state.public = false;
  assert.equal((await worker.fetch(request(`/v1/public/shares/${link.id}`), env)).status, 404);
});
test("upgrades existing share storage without losing music links", async t => {
  const { env, create } = fixture(t);
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE shared_links (id TEXT PRIMARY KEY,sender_id TEXT NOT NULL,sender_json TEXT NOT NULL,entity_type TEXT NOT NULL CHECK(entity_type IN ('track','album','artist','playlist')),entity_id TEXT NOT NULL,snapshot_json TEXT NOT NULL,created_at INTEGER NOT NULL)"),
    env.DB.prepare("INSERT INTO shared_links VALUES(?,?,?,?,?,?,?)").bind("old-link", "owner-id", "{}", "track", input.entityId, "{}", 0),
  ]);
  assert.equal((await create({ type: "profile", entityId: "liner:owner-id" })).status, 201);
  assert.equal((await env.DB.prepare("SELECT * FROM shared_links WHERE id=?").bind("old-link").first()).entity_id, input.entityId);
});
test("rejects private playlists and metadata from another owner", async t => {
  const { create, state } = fixture(t);
  state.public = false;
  assert.equal((await create({ ...input, type: "playlist", entityId: playlistId })).status, 404);
  state.public = true; state.owner = "someone-else";
  assert.equal((await create({ ...input, type: "playlist", entityId: playlistId })).status, 404);
});
test("publishes only remote public tracks and stops access when privacy changes", async t => {
  const { create, env, state } = fixture(t);
  const response = await create({ ...input, type: "playlist", entityId: playlistId });
  assert.equal(response.status, 201); const link = await response.json();
  const playlistResponse = await worker.fetch(request(`/v1/public/playlists/${playlistId}`), env);
  assert.equal(playlistResponse.status, 200); const detail = await playlistResponse.json();
  assert.equal(detail.items.length, 1);
  assert.ok(!JSON.stringify(detail).includes("secret")); assert.ok(!JSON.stringify(detail).includes("Private file"));
  assert.equal((await worker.fetch(request(`/s/${link.id}`), env)).status, 200);
  state.public = false;
  assert.equal((await worker.fetch(request(`/s/${link.id}`), env)).status, 404);
  assert.equal((await worker.fetch(request(`/v1/public/playlists/${playlistId}`), env)).status, 404);
});
test("fails closed if the public playlist check cannot reach the account service", async t => {
  const { create, env, state } = fixture(t);
  const response = await create({ ...input, type: "playlist", entityId: playlistId }); const link = await response.json();
  state.fail = true;
  assert.equal((await worker.fetch(request(`/s/${link.id}`), env)).status, 503);
});
test("SQLite atomically prevents creating links beyond the account hourly limit", async t => {
  const { create, env } = fixture(t);
  const first = await create(input); assert.equal(first.status, 201);
  const now = Math.floor(Date.now() / 1000);
  await env.DB.batch(Array.from({ length: 99 }, (_, index) => env.DB.prepare("INSERT INTO shared_links VALUES(?,?,?,?,?,?,?)").bind(`test${index}`, "owner-id", "{}", "track", input.entityId, "{}", now)));
  assert.equal((await create(input)).status, 429);
});
test("HTML escapes titles and includes metadata; HEAD and CORS work", async t => {
  const { create, env } = fixture(t);
  const response = await create({ ...input, snapshot: { title: '<script>alert("x")</script>' } }); const link = await response.json();
  const page = await worker.fetch(request(`/s/${link.id}`), env);
  assert.equal(page.headers.get("cache-control"), "no-store"); assert.match(page.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  const html = await page.text();
  assert.ok(!html.includes('<script>alert("x")</script>'));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes('property="og:title"'));
  assert.equal(await (await worker.fetch(request(`/s/${link.id}`, { method: "HEAD" }), env)).text(), "");
  const cors = await worker.fetch(request("/v1/shares", { method: "OPTIONS" }), env);
  assert.equal(cors.status, 204); assert.equal(cors.headers.get("access-control-allow-origin"), "*");
});
test("rejects malformed and oversized bodies, local files and personal mixes", async t => {
  const { env, create } = fixture(t);
  for (const body of ["null", "[]", "broken"]) assert.equal((await worker.fetch(request("/v1/shares", { method: "POST", body }), env)).status, 400);
  assert.equal((await worker.fetch(request("/v1/shares", { method: "POST", body: "x".repeat(33000) }), env)).status, 413);
  for (const entityId of ["local:file", "daily-mix-1", "likes"]) assert.equal((await create({ ...input, entityId })).status, 400);
});
test("only supported entities and safe public image URLs are accepted", () => {
  for (const [type, id] of [["track", "dQw4w9WgXcQ"], ["track", "sc:123"], ["track", "au:abc123"], ["album", "MPREb_abcd"], ["artist", "UC" + "a".repeat(22)], ["playlist", "PL" + "a".repeat(20)]]) assert.ok(validEntity(type, id));
  assert.equal(snapshotOf({ coverUrl: "javascript:alert(1)" }).coverUrl, "");
  assert.equal(publicPlaylistSnapshot({ title: "Title", description: "Hello⁣lane-local:secret⁣lane-source:yandex" }).subtitle, "Hello");
});
test("proxies existing account requests to their fixed service with the body intact", async t => {
  const { env, state } = fixture(t);
  const response = await worker.fetch(request("/v1/auth/refresh", { method: "POST", headers: { authorization: "Bearer token", "x-liner-signature": "client-signature" }, body: '{"refreshToken":"dummy"}' }), env);
  assert.equal(response.status, 200);
  const call = state.calls.at(-1);
  assert.equal(call.path, "/v1/auth/refresh"); assert.equal(call.init.headers.get("authorization"), "Bearer token"); assert.equal(call.init.redirect, "manual");
  assert.equal(await new Response(call.init.body).text(), '{"refreshToken":"dummy"}');
});
test("serves Android associations, requires D1 for sharing, blocks recursive origins", async t => {
  const { env } = fixture(t);
  assert.equal((await worker.fetch(request("/.well-known/assetlinks.json"), {})).status, 503);
  const association = await worker.fetch(request("/.well-known/assetlinks.json"), { ANDROID_SHA256_FINGERPRINTS: Array(32).fill("AB").join(":") });
  assert.equal(association.status, 200); assert.equal((await association.json())[0].target.package_name, "com.therikky.lane");
  assert.equal((await worker.fetch(request("/v1/shares", { method: "POST", body: JSON.stringify(input) }), {})).status, 503);
  assert.equal((await worker.fetch(request("/v1/me"), { ...env, ACCOUNT_API_ORIGIN: "https://lane-app.site" })).status, 503);
  assert.equal((await worker.fetch(request("/admin"), {})).status, 404);
  assert.equal((await worker.fetch(request("/"), {})).status, 200);
});
test("the bundled app signer emits fresh account signatures", () => {
  const sign = createSigner(module);
  const first = sign("GET", "/v1/me"); const second = sign("GET", "/v1/me");
  assert.ok(first["x-liner-signature"]); assert.match(first["x-liner-nonce"], /^[a-f0-9]{16}$/); assert.notEqual(first["x-liner-nonce"], second["x-liner-nonce"]);
});

test("integration connections are encrypted, account scoped and protected against stale writes", async t => {
  const { env, state } = fixture(t);
  env.INTEGRATION_SESSION_KEY = Buffer.alloc(32, 5).toString("base64");
  const session = { accessToken: "yandex-test-token" };
  const call = (provider, method = "GET", body, authorization = "Bearer account-token") =>
    worker.fetch(request(`/v1/me/integration-sessions/liner/${provider}`, {
      method, headers: { authorization }, body: body === undefined ? undefined : JSON.stringify(body),
    }), env);

  assert.equal((await call("yandex", "GET", undefined, "")).status, 401);
  assert.deepEqual(await (await call("yandex")).json(), { revision: 0, session: null });
  assert.deepEqual(await (await call("yandex", "PUT", { revision: 0, session })).json(), { revision: 1 });
  const stored = await env.DB.prepare("SELECT payload FROM integration_sessions").first();
  assert.ok(stored.payload);
  assert.ok(!stored.payload.includes(session.accessToken));

  const response = await call("yandex");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { revision: 1, session });
  assert.deepEqual(await (await call("yandex?status")).json(), { connected: true });
  assert.deepEqual(await (await call("yandex?revision=1")).json(), { revision: 1, session: null });
  assert.deepEqual(await (await call("youtube")).json(), { revision: 0, session: null });
  state.authorized = false;
  assert.equal((await call("yandex")).status, 401);
  state.authorized = true;

  const clear = await call("yandex", "PUT", { revision: 1, session: null });
  assert.deepEqual(await clear.json(), { revision: 2 });
  assert.equal((await call("yandex", "PUT", { revision: 1, session })).status, 409);
  assert.deepEqual(await (await call("yandex")).json(), { revision: 2, session: null });
});

test("same provider session is scoped by verified Lane user and auth backend", async t => {
  const { env } = fixture(t);
  globalThis.fetch.mock.mockImplementation(async (url, init) => {
    const id = init.headers.get("authorization").endsWith("other") ? "other-id" : "owner-id";
    assert.match(String(url), /^https:\/\/(api\.tryliner\.fun|lane-account-api\.nidenseekn\.workers\.dev)\/v1\/me$/);
    return Response.json({ id });
  });
  const session = {
    accessToken: "youtube-access-token", refreshToken: "youtube-refresh-token",
    tokenType: "Bearer", expiresAt: 5000, pageId: "12345",
  };
  const url = backend => `/v1/me/integration-sessions/${backend}/youtube`;
  const call = (backend, owner, body) => worker.fetch(request(url(backend), {
    method: body ? "PUT" : "GET",
    headers: { authorization: `Bearer ${owner}` },
    body: body && JSON.stringify(body),
  }), env);

  assert.equal((await call("liner", "primary", { revision: 0, session })).status, 503);
  env.INTEGRATION_SESSION_KEY = Buffer.alloc(32, 8).toString("base64");
  assert.equal((await call("liner", "primary", { revision: 0, session })).status, 200);
  assert.deepEqual(await (await call("liner", "other")).json(), { revision: 0, session: null });
  assert.deepEqual(await (await call("hyprr", "primary")).json(), { revision: 0, session: null });
  assert.equal((await call("hyprr", "primary", { revision: 0, session })).status, 200);
  const signOut = await worker.fetch(request("/v1/me/youtube-auth/sign-out", {
    method: "POST", headers: { authorization: "Bearer primary" },
  }), env);
  assert.equal(signOut.status, 200);
  assert.deepEqual(await (await call("liner", "primary")).json(), { revision: 2, session: null });
  assert.deepEqual(await (await call("hyprr", "primary")).json(), { revision: 1, session });
});

test("profile stores banner, links and favorites in D1 and merges independent edits", async t => {
  const { env } = fixture(t);
  const headers = { authorization: "Bearer account-token", "content-type": "application/json" };
  const path = "/v1/me/profile-customization/liner";
  const read = () => worker.fetch(request(path, { headers }), env);
  const patch = body => worker.fetch(request(path, { method: "PATCH", headers, body: JSON.stringify(body) }), env);
  assert.deepEqual(await (await read()).json(), { banner: null, links: [], artist: null, tracks: [] });
  const banner = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
  const track = { id: "song-1", title: "Song", artists: "Artist", coverUrl: "https://example.test/cover.jpg", durationMs: 10000, playCount: 0 };
  assert.equal((await patch({ banner, tracks: [track] })).status, 200);
  assert.equal((await patch({ links: ["https://example.test/me"] })).status, 200);
  assert.deepEqual(await (await read()).json(), { banner, artist: null, tracks: [track], links: ["https://example.test/me"] });
  const stored = await env.DB.prepare("SELECT document_json FROM profile_customization WHERE owner=?").bind(JSON.stringify(["liner", "owner-id"])).first();
  assert.equal(JSON.parse(stored.document_json).banner, banner);
  const deleted = await patch({ banner: null, artist: null, tracks: [] });
  assert.equal(deleted.status, 200);
  assert.deepEqual(await (await read()).json(), { banner: null, artist: null, tracks: [], links: ["https://example.test/me"] });
});

test("profile allows exactly one track or one artist, including concurrent updates and legacy data", async t => {
  const { env, create } = fixture(t);
  const headers = { authorization: "Bearer account-token", "content-type": "application/json" };
  const path = "/v1/me/profile-customization/liner";
  const read = async () => (await worker.fetch(request(path, { headers }), env)).json();
  const patch = body => worker.fetch(request(path, { method: "PATCH", headers, body: JSON.stringify(body) }), env);
  const track = { id: "dQw4w9WgXcQ", title: "Song", artists: "Artist", coverUrl: "", durationMs: 10000, playCount: 0 };
  const artist = { id: "artist-1", name: "Artist", coverUrl: "" };
  assert.equal((await patch({ tracks: [track, { ...track, id: "another" }] })).status, 400);
  assert.equal((await patch({ tracks: [track], artist })).status, 400);
  assert.equal((await patch({ tracks: [track] })).status, 200);
  assert.equal((await read()).artist, null);
  assert.equal((await patch({ artist })).status, 200);
  assert.deepEqual((await read()).tracks, []);
  await Promise.all([patch({ tracks: [track] }), patch({ artist })]);
  const current = await read();
  assert.equal(current.tracks.length + Number(!!current.artist), 1);
  await env.DB.batch([env.DB.prepare("UPDATE profile_customization SET document_json=? WHERE owner=?")
    .bind(JSON.stringify({ artist, tracks: [track, { ...track, id: "another" }] }), JSON.stringify(["liner", "owner-id"]))]);
  const legacy = await read();
  assert.deepEqual(legacy.tracks, [track]);
  assert.equal(legacy.artist, null);
  const link = await (await create({ type: "profile", entityId: "liner:owner-id" })).json();
  const shared = await (await worker.fetch(request(`/v1/public/shares/${link.id}`), env)).json();
  assert.equal(shared.profile.tracks.length, 1);
  assert.equal(shared.profile.artist, null);
});

test("profile rejects invalid content, excessive favorites and oversized uploads", async t => {
  const { env } = fixture(t);
  const patch = body => worker.fetch(request("/v1/me/profile-customization/liner", { method: "PATCH", headers: { authorization: "Bearer account-token" }, body: JSON.stringify(body) }), env);
  for (const body of [{ banner: "data:image/svg+xml;base64,PHN2Zz4=" }, { links: ["javascript:alert(1)"] }, { links: ["https://user:password@example.test/"] }, { tracks: [{ id: "local:secret" }] }, { tracks: [1, 2, 3, 4] }, { owner: "other-account" }, { toString: "invalid" }]) {
    assert.equal((await patch(body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await patch({ banner: "x".repeat(800000) })).status, 413);
});

test("profile preserves animated GIF banners and rejects mismatched image types", async t => {
  const { env } = fixture(t);
  const patch = banner => worker.fetch(request("/v1/me/profile-customization/liner", {
    method: "PATCH", headers: { authorization: "Bearer account-token" }, body: JSON.stringify({ banner }),
  }), env);
  const banner = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  const response = await patch(banner);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).banner, banner);
  assert.equal((await patch("data:image/gif;base64,PHN2Zz4=")).status, 400);
});

test("profile requires a valid account and isolates account backends and users", async t => {
  const { env, state } = fixture(t);
  const path = "/v1/me/profile-customization/liner";
  assert.equal((await worker.fetch(request(path), env)).status, 401);
  state.authorized = false;
  assert.equal((await worker.fetch(request(path, { headers: { authorization: "Bearer bad" } }), env)).status, 401);
  state.authorized = true;
  await worker.fetch(request(path, { headers: { authorization: "Bearer account-token" } }), env);
  await env.DB.batch([env.DB.prepare("INSERT INTO profile_customization(owner,document_json) VALUES(?,?)").bind(JSON.stringify(["hyprr", "owner-id"]), JSON.stringify({ links: ["https://secret.example/"] }))]);
  assert.deepEqual((await (await worker.fetch(request(path, { headers: { authorization: "Bearer account-token" } }), env)).json()).links, []);
});

test("sharing uses the selected account service for tracks, artists and public playlists", async t => {
  const directory = mkdtempSync(join(tmpdir(), "lane-sharing-backend-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const calls = [];
  const upstream = mock.method(globalThis, "fetch", async (url, init) => {
    const target = new URL(url); calls.push(target.href);
    assert.equal(target.origin, "https://lane-account-api.nidenseekn.workers.dev");
    assert.ok(init.headers.get("x-liner-signature"));
    if (target.pathname === "/v1/me") return Response.json({ id: "new-user", username: "listener", isPublic: true });
    if (target.pathname === "/v1/users/new-user") return Response.json({ id: "new-user", username: "listener", isPublic: true });
    if (target.pathname === `/v1/me/playlists/${playlistId}`) return Response.json({ playlist: { id: playlistId, ownerId: "new-user", title: "Public playlist", isPublic: true }, items: [] });
    if (target.pathname === "/v1/users/new-user/playlists") return Response.json({ items: [{ id: playlistId, isPublic: true }] });
    return new Response(null, { status: 404 });
  });
  t.after(() => upstream.mock.restore());
  const env = { DB: sqliteD1(join(directory, "db.sqlite")), signRequest: createSigner(module) };
  for (const type of ["track", "artist", "album", "playlist", "profile"]) {
    const response = await worker.fetch(request("/v1/shares", { method: "POST", headers: { authorization: "Bearer new-account-token" }, body: JSON.stringify({ type, entityId: ({ profile: "hyprr:new-user", playlist: playlistId, track: "dQw4w9WgXcQ", artist: "UCabcdefghijklmnopqrstuv", album: "MPREabcdefgh" })[type], snapshot: { title: "Music" }, authBackend: "hyprr" }) }), env);
    assert.equal(response.status, 201, `${type}: ${await response.clone().text()}`);
    const share = await response.json();
    assert.equal((await worker.fetch(request(`/v1/public/shares/${share.id}`), env)).status, 200);
  }
  assert.ok(calls.some(url => url.includes("/v1/users/new-user/playlists")));
  const profile = await worker.fetch(request("/v1/me/profile-customization/hyprr", { headers: { authorization: "Bearer new-account-token" } }), env);
  assert.equal(profile.status, 200);
});
