// Hyperdrive does not invalidate cached SELECTs after INSERT/DELETE. A
// timestamped relationship snapshot must be read fresh for follow controls.
export async function profileRelation(database, targetId, viewerId = null) {
  const result = await database.query(
    `SELECT CURRENT_TIMESTAMP AS observed_at,
      (SELECT count(*)::int FROM user_follows WHERE followed_id=$1) AS followers,
      (SELECT count(*)::int FROM user_follows WHERE follower_id=$1) AS following,
      EXISTS(SELECT 1 FROM user_follows WHERE follower_id=$2 AND followed_id=$1) AS is_following`,
    [targetId, viewerId || "00000000-0000-0000-0000-000000000000"],
  );
  const row = result.rows[0];
  if (!row || typeof row.is_following !== "boolean") throw new Error("Invalid relationship response");
  return {
    followers: Math.max(0, Number(row.followers) || 0),
    following: Math.max(0, Number(row.following) || 0),
    is_following: row.is_following,
    observedAt: row.observed_at instanceof Date ? row.observed_at.toISOString() : String(row.observed_at),
  };
}
