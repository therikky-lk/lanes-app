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
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const module = new WebAssembly.Module(readFileSync(new URL("./signer.wasm", import.meta.url)));
const playlistId = "12345678-1234-1234-1234-123456789abc";
const request = (path, init) => new Request(`https://lane-app.site${path}`, init);
const input = { type: "track", entityId: "dQw4w9WgXcQ", snapshot: { title: "Song", subtitle: "Artist" }, senderId: "forged-user" };
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "lane-d1-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const state = { public: true, authorized: true, fail: false, owner: "owner-id", calls: [] };
  const fetch = mock.method(globalThis, "fetch", async (url, init) => {
    const path = new URL(url).pathname;
    state.calls.push({ url: String(url), path, init });
    assert.equal(new URL(url).origin, "https://api.tryliner.fun");
    if (state.fail) throw new Error("Temporary upstream failure");
    assert.ok(init.headers.get("user-agent").includes("lane/"));
    assert.ok(init.headers.get("x-liner-signature"));
    if (path === "/v1/me") return Response.json(state.authorized ? { id: "owner-id", username: "alice", displayName: "Alice", email: "private@example.test" } : {}, { status: state.authorized ? 200 : 401 });
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
test("rejects anonymous and invalid account sessions", async t => {
  const { env, create, state } = fixture(t);
  const anonymous = await worker.fetch(request("/v1/shares", { method: "POST", body: JSON.stringify(input) }), env);
  assert.equal(anonymous.status, 401); assert.equal(state.calls.length, 0);
  state.authorized = false; assert.equal((await create(input)).status, 401);
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
