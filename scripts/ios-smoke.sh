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
private_dir=""
finish_account() {
  status=$?
  rm -f "$credentials"
  xcrun simctl uninstall "$device" "$bundle" >/dev/null 2>&1 || true
  if [[ -n "$private_dir" ]]; then
    if compgen -G "$private_dir/screens/*.png" >/dev/null; then
      if ! (tar -czf - -C "$private_dir/screens" . | "$openssl" cms -encrypt -binary -aes256 -outform DER \
        -out "$private_dir/qa-gallery.cms" "$private_dir/recipient.pem"); then
        status=1
      else
        mv "$private_dir/qa-gallery.cms" "$output/qa-gallery.cms"
      fi
    fi
    rm -rf "$private_dir"
  fi
  exit "$status"
}
trap finish_account EXIT
mkdir -p "$(dirname "$credentials")"
rm -f "$marker"
node -e 'require("node:fs").writeFileSync(process.argv[1], JSON.stringify({ email: process.env.LANE_QA_EMAIL, password: process.env.LANE_QA_PASSWORD }), {mode: 0o600})' "$credentials"
unset LANE_QA_EMAIL LANE_QA_PASSWORD
args=(--lane-account-test)
if [[ -n ${LANE_QA_CAPTURE_CERT:-} ]]; then
  private_dir=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/lane-private-shots.XXXXXX")
  chmod 700 "$private_dir"
  mkdir "$private_dir/screens"
  printf '%s' "$LANE_QA_CAPTURE_CERT" > "$private_dir/recipient.pem"
  unset LANE_QA_CAPTURE_CERT
  openssl=$(command -v openssl)
  if command -v brew >/dev/null && [[ -x "$(brew --prefix openssl@3)/bin/openssl" ]]; then
    openssl="$(brew --prefix openssl@3)/bin/openssl"
  fi
  "$openssl" x509 -in "$private_dir/recipient.pem" -noout
  capture_request="$container/Library/Caches/lane-qa-capture"
  capture_ack="$container/Library/Caches/lane-qa-capture-ack"
  rm -f "$capture_request" "$capture_ack"
  args+=(--lane-capture-gallery)
fi
xcrun simctl launch --terminate-running-process "$device" "$bundle" "${args[@]}"
deadline=$((SECONDS + 190))
while ((SECONDS < deadline)); do
  if [[ -n "$private_dir" && -f "$capture_request" ]]; then
    name=$(cat "$capture_request")
    rm -f "$capture_request"
    if [[ "$name" =~ ^[0-9]{2}-[a-z0-9-]{1,45}$ ]] &&
      xcrun simctl io "$device" screenshot "$private_dir/screens/$name.png" >/dev/null 2>&1; then
      printf '%s' "$name" > "$capture_ack"
    fi
  fi
  if [[ -f "$marker" ]]; then
    cp "$marker" "$output/account.json"
    cat "$output/account.json"
    node -e 'const r = require(process.argv[1]); if (r.login !== "passed" || Object.values(r.routes).includes(false) || r.liquidGlassVisible || r.theme === "liquid-glass") process.exit(1)' "$output/account.json"
    exit 0
  fi
  sleep 0.25
done
echo "The authenticated screen check didn't finish" >&2
exit 1
