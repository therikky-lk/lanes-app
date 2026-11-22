// Used by the account service's profileJson serializer. Aggregate only; never
// return listening history or library contents through a public profile.
export async function profileStats(database, user, viewerId) {
  const own = viewerId === user.id;
  // Aggregate counts are part of a public profile. The separate history/likes
  // flags continue to protect the underlying lists, not these counters.
  const historyVisible = own || user.is_public === true;
  const likesVisible = historyVisible;
  const result = await database.query(
    // CURRENT_TIMESTAMP also makes this a fresh Hyperdrive read after writes.
    `SELECT CURRENT_TIMESTAMP AS observed_at,
      CASE WHEN $2::boolean THEN (SELECT COALESCE(SUM(played_duration_ms),0) FROM playback_history WHERE user_id=$1) ELSE NULL END AS listened_ms,
      CASE WHEN $3::boolean THEN (SELECT COUNT(*) FROM liked_tracks WHERE user_id=$1) ELSE NULL END AS liked_count`,
    [user.id, historyVisible, likesVisible],
  );
  const count = value => value == null ? null : Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : null;
  return {
    listenedDurationMs: historyVisible ? count(result.rows[0]?.listened_ms) : null,
    likedTracksCount: likesVisible ? count(result.rows[0]?.liked_count) : null,
  };
}
