const EMPTY = { banner: null, links: [], artist: null, tracks: [] };
export function normalizeProfile(document) {
  const profile = { ...EMPTY, ...document };
  // Older clients allowed multiple favorites. Read them as a single selection.
  const tracks = Array.isArray(profile.tracks) ? profile.tracks.slice(0, 1) : [];
  return { ...profile, tracks, artist: tracks.length ? null : profile.artist };
}

export async function profileCustomization(request, env, { owner, readBody, json, error }) {
  if (!["GET", "PATCH"].includes(request.method)) return json({ code: "METHOD_NOT_ALLOWED" }, 405);
  if (request.method === "GET") {
    const row = await env.DB.prepare("SELECT document_json FROM profile_customization WHERE owner=?").bind(owner).first();
    return json(normalizeProfile(row ? JSON.parse(row.document_json) : {}));
  }
  const body = await readBody(request, 768 * 1024);
  const invalid = () => error(400, "INVALID_PROFILE", "Invalid profile customization.");
  const text = (value, max) => {
    if (typeof value !== "string" || value.length > max) invalid();
    return value;
  };
  const image = value => {
    if (value === "") return "";
    text(value, 2048);
    let url;
    try { url = new URL(value); } catch { invalid(); }
    if (url.protocol !== "https:" || url.username || url.password) invalid();
    return url.href;
  };
  const entity = (value, artist = false) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
    const id = text(value.id, 200);
    if (!id || id.startsWith("local:")) invalid();
    return artist
      ? { id, name: text(value.name, 200), coverUrl: image(value.coverUrl) }
      : { id, title: text(value.title, 300), artists: text(value.artists, 500), coverUrl: image(value.coverUrl), durationMs: Math.max(0, Math.min(86400000, Number(value.durationMs) || 0)), playCount: 0 };
  };
  const patch = {};
  for (const key of Object.keys(body)) {
    if (!Object.hasOwn(EMPTY, key)) invalid();
    const value = body[key];
    if (key === "banner") {
      if (value !== null && (typeof value !== "string" || value.length > 700000 || !/^(?:data:image\/jpeg;base64,\/9j\/|data:image\/gif;base64,R0lGOD[dl]h)[A-Za-z0-9+/=]+$/.test(value))) invalid();
      patch.banner = value;
    } else if (key === "links") {
      if (!Array.isArray(value) || value.length > 3) invalid();
      patch.links = value.map(link => { const url = image(link); if (!url) invalid(); return url; });
    } else if (key === "artist") patch.artist = value === null ? null : entity(value, true);
    else {
      if (!Array.isArray(value) || value.length > 1) invalid();
      patch.tracks = value.map(track => entity(track));
      if (new Set(patch.tracks.map(track => track.id)).size !== patch.tracks.length) invalid();
    }
  }
  if (!Object.keys(patch).length) invalid();
  if (patch.artist && patch.tracks?.length) invalid();
  // Set both fields in the same atomic write. Concurrent edits cannot leave
  // both a track and an artist selected, even when made on different devices.
  if (patch.artist) patch.tracks = [];
  if (patch.tracks?.length) patch.artist = null;
  // Merge each edited field atomically so a banner upload cannot erase music
  // chosen on another device. The server derives the owner from the session.
  const [result] = await env.DB.batch([
    env.DB.prepare("INSERT INTO profile_customization(owner,document_json) VALUES(?,json_patch(?,?)) ON CONFLICT(owner) DO UPDATE SET document_json=json_patch(profile_customization.document_json,?) RETURNING document_json")
      .bind(owner, JSON.stringify(EMPTY), JSON.stringify(patch), JSON.stringify(patch)),
  ]);
  return json(normalizeProfile(JSON.parse(result.results[0].document_json)));
}
