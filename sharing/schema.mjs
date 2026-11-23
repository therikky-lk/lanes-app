// Initial schema is created once per Worker isolate, using idempotent D1 statements.
export const schemaStatements = [
  "CREATE TABLE IF NOT EXISTS public_playlist_backends (id TEXT PRIMARY KEY,backend TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS profile_customization (owner TEXT PRIMARY KEY,document_json TEXT NOT NULL)",
  `CREATE TABLE IF NOT EXISTS shared_links (
    id TEXT PRIMARY KEY, sender_id TEXT NOT NULL, sender_json TEXT NOT NULL,
    entity_type TEXT NOT NULL CHECK(entity_type IN ('track','album','artist','playlist','profile')),
    entity_id TEXT NOT NULL, snapshot_json TEXT NOT NULL, created_at INTEGER NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS shared_links_sender_created ON shared_links(sender_id,created_at)",
  "CREATE TABLE IF NOT EXISTS public_playlists (id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,document_json TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS integration_sessions (owner TEXT NOT NULL,provider TEXT NOT NULL,revision INTEGER NOT NULL,payload TEXT,PRIMARY KEY(owner,provider))",
  "CREATE TABLE IF NOT EXISTS youtube_auth_state (user_id TEXT PRIMARY KEY,revision INTEGER NOT NULL DEFAULT 0)",
  `CREATE TABLE IF NOT EXISTS track_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, track_id TEXT NOT NULL, owner TEXT NOT NULL,
    author_name TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0
  )`,
  "CREATE INDEX IF NOT EXISTS track_comments_feed ON track_comments(track_id,id DESC) WHERE deleted=0",
  "CREATE INDEX IF NOT EXISTS track_comments_rate ON track_comments(owner,created_at)",
  "CREATE TABLE IF NOT EXISTS track_comment_assets (comment_id INTEGER PRIMARY KEY, avatar TEXT, photo TEXT)",
  "CREATE TRIGGER IF NOT EXISTS track_comments_remove_assets AFTER UPDATE OF deleted ON track_comments WHEN NEW.deleted=1 BEGIN DELETE FROM track_comment_assets WHERE comment_id=NEW.id; END",
];
