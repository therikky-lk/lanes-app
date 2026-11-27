# AppImage review

## Findings (2026-11-22)

[PR #12350](https://github.com/AppImage/appimage.github.io/pull/12350) was merged
on 2026-11-21. It tested Lane 1.8.3, not the current working copy (1.8.4).
Do not submit a duplicate catalog entry.

- `Name=Lane` was already correct. The discovery bot derived `lanes` from the
  repository name. The npm name and executable remain `lane`, the GitHub
  repository remains `therikky-lk/lanes-app`, and the application ID is unchanged.
- `desktopName=Lane` and `syncDesktopName=true` now generate `Lane.desktop`
  and matching `StartupWMClass=Lane`. The icon/executable stay `lane`.
- `Categories=AudioVideo;Audio;Player;` is valid: AudioVideo is the main
  freedesktop category, Audio and Player describe an audio player.
- Missing repository description and topics are GitHub settings, not files.
  Suggested description, based on README:
  **Cross-platform music player with personal radio, playlists, local music,
  synced lyrics, and offline caching.**
  Suggested topics: `music-player`, `audio-player`, `linux`, `appimage`,
  `electron`, `react`, `typescript`, `android`, `windows`, `macos`.
- No license was detected by the catalog. The owner must choose a license;
  this change intentionally does not invent one.

## Runtime and compatibility

The existing, locked electron-builder 26.15.3 supports the new runtime but
defaults to toolset `0.0.0` (legacy FUSE2). We explicitly select `1.0.3`, the
checksum-verified toolset supported by this builder. The builder schema still
labels the newer toolsets **beta**; this is not a claim that the toolset is a
stable release. No Electron/dependency version bump or new Linux build baseline
is needed. The toolset contains runtime 20251108 and the fix for builder #9598.

The static runtime avoids the old runtime's host glibc/libfuse2 dependency.
It does NOT make Electron or its bundled native code independent of host glibc,
GTK, NSS, the display server, etc. Keep Ubuntu 22.04 as the release builder.
Before publishing, smoke-test the built image on the supported distributions,
including launching, audio playback and updating. There is no documented
exhaustive supported-distro matrix in the README; don't promise one.

## AppImageUpdate alongside electron-updater

`prepare-appimage.mjs` copies the builder's verified toolset into its managed
temporary directory and writes only the runtime's reserved `.upd_info` section.
It never modifies shared caches. This occurs BEFORE SquashFS/blockmap generation,
so `latest-linux.yml`, embedded blockmap and SHA-512 still describe the final
bytes. The helper is ELF64-only because the Linux release currently targets x64.
The internal toolset API is covered by packaging tests and must be revalidated
when updating electron-builder/toolsets.

Embedded information:

```text
gh-releases-zsync|therikky-lk|lanes-app|latest|Lane-*-x86_64.AppImage.zsync
```

The existing workflow publishes a single rolling release with tag `releases`.
`latest` selects that published GitHub release; each `.zsync` points to the
versioned AppImage at the stable `releases/download/releases/` URL, NOT the
temporary `releases-next` draft. The x64 glob avoids mixing architectures.
`Lane-latest.AppImage` remains a download alias, not a second update target.

`appimage-zsync.mjs` runs zsyncmake after all builder artifacts are final, without
rewriting the image. GitHub Actions uploads `.zsync` alongside the original
updater YAML and packages into the same draft. Publication still waits for
ALL platforms. Checksums include `.zsync`. Windows/macOS hooks are no-ops.
If release tags, repository, architecture or artifact naming change, update the
information string, zsync URLs, tests and workflow together.

Local checks:

```bash
pnpm test:packaging
pnpm electron:build:linux
./release/Lane-1.8.4-x86_64.AppImage --appimage-updateinformation
```

The Linux release job additionally extracts the image without FUSE, validates
`Lane.desktop` and checks its exact name/categories and embedded update string.
AppImageUpdate and Lane's own updater are separate clients; do not run both
against the same file simultaneously.

Local validation completed: four packaging tests, 28 theme tests and TypeScript
checking pass. An AppImage and `.zsync` were built using existing compiled app
assets in an isolated output directory. Its extracted desktop entry passed
desktop-file-validate; its runtime has no ELF interpreter; embedded update
information, updater SHA-512/size/blockmap and zsync SHA-1/URL were checked.
This is packaging validation, not a fresh frontend build, an end-to-end update
from GitHub or a graphical/audio smoke test on all supported Linux distributions.

## Theme

The current main app already defaults to `system`: next-themes enables system
detection, and `lane_theme_preset` / `lane_theme_sync` persist the user's preset.
Explicit dark/AMOLED/colored choices must not be overwritten when the OS changes.
The overlay is deliberately forced dark. No visual redesign or theme reset is
needed to address the older screenshot. Verify light/dark OS changes with a
fresh profile, then verify that an explicit saved choice survives restart.
`src/app/systemTheme.test.tsx` now exercises light/dark startup, live system
changes and explicit overrides against the real ThemeProvider + ThemeSync.
These and the existing startup/persistence tests run in CI. The catalog's
1.8.3 screenshot must still be retested with the newly published release.

## Separate catalog correction

The catalog currently requires outside PRs to change exactly one file in `data/`.
A rename appears as two changed paths to that check. Ask maintainers to perform
the following rename (or approve a coordinated exception), rather than opening
a duplicate entry:

```bash
git mv data/lanes data/Lane
```

Keep its contents exactly `https://github.com/therikky-lk/lanes-app`.
The catalog's processing derives its application name from this input basename;
the Lane repository itself must NOT be renamed.

After publishing the corrected AppImage, ask maintainers to regenerate the
existing entry under `Lane`, with `AudioVideo;Audio;Player;`, and remove/redirect
the stale `/lanes/` entry. Current generated metadata lives in `apps/lanes.md`,
and icons/screenshots in `database/lanes/`. Do not simply rename these files:
their internal links and generated catalog/API/category indexes need rebuilding.
The previous `apps/lanes.md` records `Categories: Audio` and dynamic runtime
compatibility results for 1.8.3. Do not manually replace those test results with
unverified claims.

Suggested separate PR title: **Correct Lane catalog name and refresh audio categories**.
Mention that this updates the entry merged by #12350, rather than adding a new app.
