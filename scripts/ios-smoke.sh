#!/usr/bin/env bash
set -euo pipefail

app=${1:?pass the built simulator App.app}
output=${2:?pass the diagnostics directory}
bundle=com.therikky.lane
mkdir -p "$output"
output=$(cd "$output" && pwd)

device=$(xcrun simctl list devices available -j | node -e '
  const fs = require("node:fs");
  const runtimes = Object.entries(JSON.parse(fs.readFileSync(0, "utf8")).devices)
    .filter(([name]) => name.includes(".iOS-"))
    .sort(([a], [b]) => b.localeCompare(a, undefined, {numeric: true}));
  for (const [, devices] of runtimes) {
    const phone = devices.find(device => device.isAvailable && device.name.startsWith("iPhone"));
    if (phone) { console.log(phone.udid); process.exit(0); }
  }
  console.error("No iPhone simulator installed");
  process.exit(1);
')

cleanup() {
  if [[ ! -f "$output/launch.png" ]]; then
    xcrun simctl io "$device" screenshot "$output/launch.png" || true
  fi
  xcrun simctl spawn "$device" log show --last 3m --predicate 'process == "App"' \
    > "$output/simulator.log" || true
}
trap cleanup EXIT

xcrun simctl status_bar "$device" clear >/dev/null 2>&1 || true
xcrun simctl boot "$device" || true
xcrun simctl bootstatus "$device" -b
xcrun simctl install "$device" "$app"
container=$(xcrun simctl get_app_container "$device" "$bundle" data)
marker="$container/Library/Caches/lane-smoke-ready"
if [[ -f "$marker" ]]; then rm "$marker"; fi
xcrun simctl launch --terminate-running-process "$device" "$bundle" --lane-smoke-test

for ((attempt = 0; attempt < 60; attempt++)); do
  if [[ -f "$marker" ]]; then
    cp "$marker" "$output/result.txt"
    cat "$output/result.txt"
    xcrun simctl io "$device" screenshot "$output/launch.png"
    break
  fi
  sleep 1
done

if [[ ! -f "$marker" ]]; then
  echo "The renderer/audio smoke check didn't finish" >&2
  exit 1
fi

marker="$container/Library/Caches/lane-glass-ready"
if [[ -f "$marker" ]]; then rm "$marker"; fi
xcrun simctl launch --terminate-running-process "$device" "$bundle" --lane-glass-test
for ((attempt = 0; attempt < 60; attempt++)); do
  if [[ -f "$marker" ]]; then
    cp "$marker" "$output/glass.json"
    cat "$output/glass.json"
    xcrun simctl io "$device" screenshot "$output/glass.png"
    node -e 'const r = require(process.argv[1]); if (r.theme === "liquid-glass" || r.lens || !r.glass.filter?.includes("blur(") || r.control.filter !== "none") process.exit(1)' "$output/glass.json"
    break
  fi
  sleep 1
done
if [[ ! -f "$marker" ]]; then
  echo "The standard blur check didn't finish" >&2
  exit 1
fi

# Optional live-account check. The report contains only route and status
# information; authenticated app screens and logs are not saved.
if [[ -z ${LANE_QA_EMAIL:-} || -z ${LANE_QA_PASSWORD:-} ]]; then exit 0; fi
credentials="$container/Library/Caches/lane-qa-credentials"
marker="$container/Library/Caches/lane-account-ready"
trap 'rm -f "$credentials"; xcrun simctl uninstall "$device" "$bundle" >/dev/null 2>&1 || true' EXIT
mkdir -p "$(dirname "$credentials")"
rm -f "$marker"
node -e 'require("node:fs").writeFileSync(process.argv[1], JSON.stringify({ email: process.env.LANE_QA_EMAIL, password: process.env.LANE_QA_PASSWORD }), {mode: 0o600})' "$credentials"
unset LANE_QA_EMAIL LANE_QA_PASSWORD
xcrun simctl launch --terminate-running-process "$device" "$bundle" --lane-account-test
for ((attempt = 0; attempt < 125; attempt++)); do
  if [[ -f "$marker" ]]; then
    cp "$marker" "$output/account.json"
    cat "$output/account.json"
    node -e 'const r = require(process.argv[1]); if (r.login !== "passed" || Object.values(r.routes).includes(false) || r.liquidGlassVisible || r.theme === "liquid-glass") process.exit(1)' "$output/account.json"
    exit 0
  fi
  sleep 1
done
echo "The authenticated screen check didn't finish" >&2
exit 1
