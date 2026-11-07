// A test-only D1 facade backed by real SQLite through Python's standard library.
import { spawnSync } from "node:child_process";
const script = `import json,sqlite3,sys
payload=json.load(sys.stdin)
connection=sqlite3.connect(sys.argv[1])
connection.row_factory=sqlite3.Row
results=[]
with connection:
 for command in payload:
  before=connection.total_changes
  cursor=connection.execute(command['sql'],command['values'])
  results.append({'results':[dict(row) for row in cursor.fetchall()] if cursor.description else [],'meta':{'changes':connection.total_changes-before}})
print(json.dumps(results))
`;
export function sqliteD1(filename) {
  const run = commands => {
    const result = spawnSync("python", ["-c", script, filename], { input: JSON.stringify(commands), encoding: "utf8", timeout: 5000 });
    if (result.error || result.status !== 0) throw new Error(result.stderr || "SQLite failed");
    return JSON.parse(result.stdout);
  };
  return {
    prepare(sql) { return { sql, values: [], bind(...values) { this.values = values; return this; }, async first() { return run([this])[0].results[0] ?? null; } }; },
    async batch(commands) { return run(commands); },
  };
}
