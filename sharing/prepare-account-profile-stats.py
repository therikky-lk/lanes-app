"""Download the current account Worker and prepare a minimal, reversible extension.

Does not publish. Run Wrangler versions upload/deploy on the generated config
after tests. OAuth is read from Wrangler's existing login, never printed.
"""
import argparse
import json
from pathlib import Path
from email.parser import BytesParser
from email.policy import default
import tomllib
import urllib.request
import shutil

parser = argparse.ArgumentParser()
parser.add_argument("--output", default="/tmp/opencode/lane-account-profile-stats")
args = parser.parse_args()
destination = Path(args.output)
if destination.exists():
    raise SystemExit("Output directory already exists; refusing to overwrite.")
auth = tomllib.loads((Path.home() / ".config/.wrangler/config/default.toml").read_text())
base = "https://api.cloudflare.com/client/v4/accounts/3c76f6292e48ebf478f29d7587e15980/workers/scripts/lane-account-api"

def get(path=""):
    request = urllib.request.Request(base + path, headers={"Authorization": "Bearer " + auth["oauth_token"]})
    return urllib.request.urlopen(request, timeout=30)

with get("/settings") as response:
    settings = json.load(response)["result"]
with get() as response:
    raw = response.read()
    content_type = response.headers["Content-Type"]
message = BytesParser(policy=default).parsebytes(
    ("Content-Type: " + content_type + "\r\nMIME-Version: 1.0\r\n\r\n").encode() + raw
)
config = {
    "name": "lane-account-api", "compatibility_date": settings["compatibility_date"],
    "compatibility_flags": settings.get("compatibility_flags", []), "keep_vars": True,
    "find_additional_modules": True, "no_bundle": True,
    "rules": [
        {"type": "Text", "globs": ["**/*.sql"], "fallthrough": True},
        {"type": "ESModule", "globs": ["**/*.mjs"], "fallthrough": True},
    ],
    "vars": {}, "services": [], "hyperdrive": [],
}
for binding in settings["bindings"]:
    kind = binding["type"]
    if kind == "plain_text":
        config["vars"][binding["name"]] = binding["text"]
    elif kind == "service":
        service = {"binding": binding["name"], "service": binding["service"]}
        if binding.get("environment"):
            service["environment"] = binding["environment"]
        config["services"].append(service)
    elif kind == "hyperdrive":
        config["hyperdrive"].append({"binding": binding["name"], "id": binding["id"]})
    elif kind != "secret_text":
        raise SystemExit("Unrecognized binding type: " + kind)
modules = {}
for part in message.iter_parts():
    name = part.get_filename() or part.get_param("name", header="content-disposition")
    if name and name.startswith("./"):
        name = name[2:]
    if not name or Path(name).name != name:
        raise SystemExit("Unexpected module path; refusing to modify.")
    modules[name] = part.get_payload(decode=True)
main = next((name for name, data in modules.items() if b"async function profileJson(" in data), None)
if not main:
    raise SystemExit("Account profile serializer not found.")
source = modules[main].decode()
marker = "    followersCount: c.followers,"
if "profileStats(database, row, viewerId)" not in source:
    if source.count(marker) != 1:
        raise SystemExit("Profile serializer changed; manual review required.")
    source = 'import { profileStats } from "./profile-stats.mjs";\n' + source.replace(
        marker, "    ...await profileStats(database, row, viewerId),\n" + marker
    )
relation_query = '''  const counts = await database.query(
    `SELECT (SELECT count(*)::int FROM user_follows WHERE followed_id=$1) AS followers,
            (SELECT count(*)::int FROM user_follows WHERE follower_id=$1) AS following,
            EXISTS(SELECT 1 FROM user_follows WHERE follower_id=$2 AND followed_id=$1) AS is_following`,
    [row.id, viewerId || "00000000-0000-0000-0000-000000000000"]
  );
  const c = counts.rows[0];'''
if "profileRelation(database, row.id, viewerId)" not in source:
    if source.count(relation_query) != 1:
        raise SystemExit("Relationship serializer changed; manual review required.")
    source = 'import { profileRelation } from "./profile-relations.mjs";\n' + source.replace(
        relation_query, "  const c = await profileRelation(database, row.id, viewerId);"
    )
    relation_field = "...viewerId ? { isFollowing: c.is_following } : {},"
    if source.count(relation_field) != 1:
        raise SystemExit("Relationship fields changed; manual review required.")
    source = source.replace(relation_field, "...viewerId ? { isFollowing: c.is_following, relationshipUpdatedAt: c.observedAt } : {},")
old_follow = '''      if (req.method === "POST") {
        await database.query("INSERT INTO user_follows(follower_id, followed_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [viewer.id, target.id]);
      } else {
        await database.query("DELETE FROM user_follows WHERE follower_id=$1 AND followed_id=$2", [viewer.id, target.id]);
      }
      res.writeHead(204, { "x-request-id": res.requestId });
      res.end();'''
current_follow = old_follow.split('      res.writeHead')[0] + '''      const state = await profileRelation(database, target.id, viewer.id);
      json(res, 200, { isFollowing: state.is_following, followersCount: state.followers, relationshipUpdatedAt: state.observedAt });'''
new_follow = '''      const state = await writeProfileRelation(database, target.id, viewer.id, req.method === "POST");
      json(res, 200, state);'''
if new_follow not in source:
    candidates = [handler for handler in (old_follow, current_follow) if source.count(handler) == 1]
    if len(candidates) != 1:
        raise SystemExit("Follow handler changed; manual review required.")
    source = 'import { writeProfileRelation } from "./profile-relations.mjs";\n' + source.replace(candidates[0], new_follow)
target_query = "SELECT * FROM users WHERE id::text=$1 OR username=$1"
if source.count(target_query) == 1:
    source = source.replace(target_query, "SELECT *, CURRENT_TIMESTAMP AS profile_read_at FROM users WHERE id::text=$1 OR username=$1")
elif "CURRENT_TIMESTAMP AS profile_read_at" not in source:
    raise SystemExit("Public profile lookup changed; manual review required.")
config["main"] = main
destination.mkdir(parents=True)
(destination / "original.multipart").write_bytes(raw)
(destination / "original-settings.json").write_text(json.dumps(settings, indent=2))
for name, data in modules.items():
    (destination / name).write_bytes(source.encode() if name == main else data)
shutil.copyfile(Path(__file__).with_name("account-profile-stats.mjs"), destination / "profile-stats.mjs")
shutil.copyfile(Path(__file__).with_name("account-profile-relations.mjs"), destination / "profile-relations.mjs")
(destination / "wrangler.json").write_text(json.dumps(config, indent=2))
print("Prepared:", destination / "wrangler.json")
print("Existing modules, account bindings and secrets are preserved. No deployment performed.")
