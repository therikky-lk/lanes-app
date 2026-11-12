// A test-only D1 facade backed by real SQLite.
import { DatabaseSync } from "node:sqlite";

export function sqliteD1(filename) {
  const run = commands => {
    const db = new DatabaseSync(filename, { enableForeignKeyConstraints: false });
    try {
      db.exec("BEGIN");
      const changes = db.prepare("SELECT total_changes() AS count");
      const results = commands.map(({ sql, values }) => {
        const before = changes.get().count;
        const results = db.prepare(sql).all(...values).map(row => ({ ...row }));
        return { results, meta: { changes: changes.get().count - before } };
      });
      db.exec("COMMIT");
      return results;
    } finally {
      db.close();
    }
  };
  return {
    prepare(sql) {
      return {
        sql, values: [],
        bind(...values) { this.values = values; return this; },
        async first() { return run([this])[0].results[0] ?? null; },
      };
    },
    async batch(commands) { return run(commands); },
  };
}
