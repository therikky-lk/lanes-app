const PAGE_SIZE = 30;
const rowToComment = (row, owner) => ({
  id: row.id, author: row.author_name, text: row.body, createdAt: row.created_at, mine: row.owner === owner,
  ...(row.avatar ? { avatar: row.avatar } : {}),
  ...(row.has_photo ? { hasPhoto: true } : {}),
  ...(!row.avatar ? { legacyAvatar: true } : {}),
});
const positiveId = value => /^[1-9]\d{0,15}$/.test(value ?? "") && Number.isSafeInteger(Number(value));
const MAX_PHOTO = 220_000;

// Only accept a bounded JPEG emitted by the composer (not SVG/HTML).
function isCommentPhoto(encoded) {
  if (typeof encoded !== "string" || encoded.length > MAX_PHOTO || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return false;
  let bytes;
  try { bytes = atob(encoded); } catch { return false; }
  const byte = i => bytes.charCodeAt(i);
  const word = i => byte(i) * 256 + byte(i + 1);
  if (word(0) !== 0xffd8 || word(bytes.length - 2) !== 0xffd9) return false;
  for (let i = 2; i + 8 < bytes.length;) {
    if (byte(i) !== 255) return false;
    if (byte(i + 1) === 255) { i++; continue; }
    const marker = byte(i + 1);
    const size = word(i + 2);
    if (size < 2 || i + 2 + size > bytes.length) return false;
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (size < 8) return false;
      const height = word(i + 5), width = word(i + 7);
      return height > 0 && width > 0 && Math.max(height, width) === 512;
    }
    if (marker === 0xda) return false;
    i += 2 + size;
  }
  return false;
}

export async function trackComments(request, db, { trackId, commentId, resource, url, account, authorAvatar, authorProfile, readBody, json, error }) {
  const { owner, user } = account;
  if (resource) {
    if (request.method !== "GET") return json({ code: "METHOD_NOT_ALLOWED" }, 405);
    if (!positiveId(commentId)) error(404, "NOT_FOUND", "Comment not found.");
    const row = await db.prepare(`SELECT c.owner,a.photo FROM track_comments c LEFT JOIN track_comment_assets a ON a.comment_id=c.id
      WHERE c.id=? AND c.track_id=? AND c.deleted=0`).bind(Number(commentId), trackId).first();
    if (!row) error(404, "NOT_FOUND", "Comment not found.");
    if (resource === "profile") return json(await authorProfile(row.owner));
    if (resource === "avatar") {
      try { return json({ avatar: row.owner === owner ? authorAvatar(user, Infinity) : (await authorProfile(row.owner)).profile.avatarUrl }); }
      catch { return json({ avatar: "" }); }
    }
    if (!row.photo) error(404, "NOT_FOUND", "Photo not found.");
    return json({ photo: row.photo });
  }
  if (!commentId && request.method === "GET") {
    const before = url.searchParams.get("before");
    if (before !== null && !positiveId(before)) error(400, "INVALID_INPUT", "Invalid cursor.");
    const predicate = before === null ? "" : " AND c.id<?";
    const { results } = await db.prepare(`SELECT c.*,a.avatar,a.photo IS NOT NULL AS has_photo FROM track_comments c
      LEFT JOIN track_comment_assets a ON a.comment_id=c.id WHERE c.track_id=? AND c.deleted=0${predicate} ORDER BY c.id DESC LIMIT ?`)
      .bind(trackId, ...(before === null ? [] : [Number(before)]), PAGE_SIZE + 1).all();
    const items = results.slice(0, PAGE_SIZE);
    return json({ items: items.map(row => rowToComment(row, owner)), next: results.length > PAGE_SIZE ? items.at(-1).id : null });
  }
  if (!commentId && request.method === "POST") {
    const { text, photo } = await readBody(request, MAX_PHOTO + 8192);
    const body = typeof text === "string" ? text.trim() : "";
    if ((!body && !photo) || body.length > 500 || (photo != null && !isCommentPhoto(photo))) error(400, "INVALID_INPUT", "Expected a comment and/or a JPEG up to 512 pixels per side.");
    const author = [user.displayName, user.username].find(value => typeof value === "string" && value.trim())?.trim().slice(0, 80) || "Lane";
    const now = Date.now();
    const avatar = authorAvatar(user);
    const [inserted] = await db.batch([db.prepare(`INSERT INTO track_comments(track_id,owner,author_name,body,created_at)
      SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM track_comments WHERE owner=? AND created_at>?) < 5
      RETURNING *`).bind(trackId, owner, author, body, now, owner, now - 60000),
    db.prepare("INSERT INTO track_comment_assets(comment_id,avatar,photo) SELECT last_insert_rowid(),?,? WHERE changes()=1")
      .bind(avatar || null, photo || null)]);
    const row = inserted.results?.[0];
    if (!row) error(429, "RATE_LIMITED", "Please wait before posting again.");
    return json(rowToComment({ ...row, avatar, has_photo: !!photo }, owner), 201);
  }
  if (commentId && request.method === "DELETE") {
    if (!positiveId(commentId)) error(404, "NOT_FOUND", "Comment not found.");
    const row = await db.prepare("UPDATE track_comments SET deleted=1,body='',author_name='' WHERE id=? AND track_id=? AND owner=? AND deleted=0 RETURNING id")
      .bind(Number(commentId), trackId, owner).first();
    if (!row) error(404, "NOT_FOUND", "Comment not found.");
    return json({ ok: true });
  }
  return json({ code: "METHOD_NOT_ALLOWED" }, 405);
}
