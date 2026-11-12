const encoder = new TextEncoder();

const token = value => typeof value === "string" && /^[a-z\d._~+/-]{8,2048}={0,2}$/i.test(value);

function validateSession(provider, value) {
  if (value === null) return null;
  if (!value || !token(value.accessToken)) return;
  if (provider === "yandex") return { accessToken: value.accessToken };
  if (!token(value.refreshToken) || !/^Bearer$/i.test(value.tokenType) ||
      !Number.isSafeInteger(value.expiresAt) ||
      !(value.pageId === null || (typeof value.pageId === "string" && /^\d{1,40}$/.test(value.pageId)))) return;
  return {
    accessToken: value.accessToken, refreshToken: value.refreshToken,
    tokenType: "Bearer", expiresAt: value.expiresAt, pageId: value.pageId,
  };
}

async function encryptionKey(env) {
  const bytes = Uint8Array.from(atob(env.INTEGRATION_SESSION_KEY || ""), char => char.charCodeAt(0));
  if (bytes.length !== 32) throw new Error("Integration session key is unavailable.");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

const encode = bytes => btoa(String.fromCharCode(...bytes));
const decode = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));

export async function integrationSession(request, env, { owner, provider, readBody, json }) {
  const db = env.DB;
  const additionalData = encoder.encode(JSON.stringify([owner, provider]));
  if (request.method === "GET") {
    const row = await db.prepare("SELECT revision, payload FROM integration_sessions WHERE owner=? AND provider=?")
      .bind(owner, provider).first();
    const query = new URL(request.url).searchParams;
    if (provider === "yandex" && query.has("status")) {
      return json({ connected: Boolean(row?.payload) });
    }
    let session = null;
    if (row?.payload && query.get("revision") !== String(row.revision)) {
      const [iv, data] = row.payload.split(".");
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: decode(iv), additionalData }, await encryptionKey(env), decode(data),
      );
      session = JSON.parse(new TextDecoder().decode(plain));
    }
    return json({ revision: row?.revision ?? 0, session });
  }
  if (request.method !== "PUT") return json({ code: "METHOD_NOT_ALLOWED" }, 405);

  const body = await readBody(request);
  const revision = body.revision;
  const session = validateSession(provider, body.session);
  if (!Number.isSafeInteger(revision) || revision < 0 || session === undefined)
    return json({ code: "INVALID_INPUT" }, 400);

  let payload = null;
  if (session) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData }, await encryptionKey(env), encoder.encode(JSON.stringify(session)),
    );
    payload = [encode(iv), encode(new Uint8Array(encrypted))].join(".");
  }
  const statement = revision === 0
    ? db.prepare("INSERT INTO integration_sessions(owner,provider,revision,payload) VALUES(?,?,1,?) ON CONFLICT DO NOTHING")
        .bind(owner, provider, payload)
    : db.prepare("UPDATE integration_sessions SET revision=revision+1,payload=? WHERE owner=? AND provider=? AND revision=?")
        .bind(payload, owner, provider, revision);
  const [result] = await db.batch([statement]);
  return result.meta.changes === 1 ? json({ revision: revision + 1 }) : json({ code: "SESSION_CHANGED" }, 409);
}
