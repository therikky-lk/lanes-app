#!/usr/bin/env bash
set -euo pipefail

app=${1:?pass the built simulator App.app}
output=${2:?pass the diagnostics directory}
bundle=com.therikky.lane
mkdir -p "$output"

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
  xcrun simctl io "$device" screenshot "$output/launch.png" || true
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
    exit 0
  fi
  sleep 1
done

echo "The renderer/audio smoke check didn't finish" >&2
exit 1
