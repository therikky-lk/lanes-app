// Initial schema is created once per Worker isolate, using idempotent D1 statements.
export const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS shared_links (
    id TEXT PRIMARY KEY, sender_id TEXT NOT NULL, sender_json TEXT NOT NULL,
    entity_type TEXT NOT NULL CHECK(entity_type IN ('track','album','artist','playlist')),
    entity_id TEXT NOT NULL, snapshot_json TEXT NOT NULL, created_at INTEGER NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS shared_links_sender_created ON shared_links(sender_id,created_at)",
  "CREATE TABLE IF NOT EXISTS public_playlists (id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,document_json TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS youtube_auth_state (user_id TEXT PRIMARY KEY,revision INTEGER NOT NULL DEFAULT 0)",
];
