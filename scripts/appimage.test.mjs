import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { embedUpdateInformation, UPDATE_INFORMATION } from "./appimage-update-info.mjs";
import createZsync from "./appimage-zsync.mjs";
import prepareAppImage from "./prepare-appimage.mjs";

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const require = createRequire(import.meta.url);
const builderRequire = createRequire(require.resolve("electron-builder"));
const { LinuxTargetHelper } = builderRequire("app-builder-lib/out/targets/LinuxTargetHelper.js");

test("generated desktop entry uses Lane and freedesktop audio categories", async () => {
  const helper = new LinuxTargetHelper({
    platformSpecificBuildOptions: pkg.build.linux,
    info: { metadata: pkg },
    config: pkg.build,
    executableName: "lane",
    appInfo: { productName: pkg.build.productName, description: pkg.description },
    fileAssociations: [],
  });
  assert.equal(helper.getDesktopFileName(), "Lane");
  const entry = await helper.computeDesktopEntry(pkg.build.linux, "AppRun %U");
  assert.match(entry, /^Name=Lane$/m);
  assert.match(entry, /^StartupWMClass=Lane$/m);
  assert.match(entry, /^Categories=AudioVideo;Audio;Player;$/m);
  assert.match(entry, /^Terminal=false$/m);
  assert.equal(pkg.name, "lane"); // npm/executable IDs need not be capitalized.
  assert.equal(pkg.build.publish[0].repo, "lanes-app");
  assert.equal(pkg.build.toolsets.appimage, "1.0.3");
});

function runtimeFixture() {
  const runtime = Buffer.alloc(1024);
  runtime.write("\x7fELF");
  runtime[4] = 2;
  runtime[5] = 1;
  runtime.writeBigUInt64LE(64n, 40);
  runtime.writeUInt16LE(64, 58);
  runtime.writeUInt16LE(3, 60);
  runtime.writeUInt16LE(1, 62);
  runtime.writeBigUInt64LE(256n, 128 + 24);
  runtime.writeBigUInt64LE(32n, 128 + 32);
  runtime.write("\0.shstrtab\0.upd_info\0", 256);
  runtime.writeUInt32LE(11, 192);
  runtime.writeBigUInt64LE(512n, 192 + 24);
  runtime.writeBigUInt64LE(256n, 192 + 32);
  return runtime;
}

test("embed update info without changing runtime size or bytes outside the section", () => {
  const original = runtimeFixture();
  const result = embedUpdateInformation(original);
  assert.equal(result.length, original.length);
  assert.deepEqual(result.subarray(0, 512), original.subarray(0, 512));
  assert.deepEqual(result.subarray(768), original.subarray(768));
  assert.equal(result.toString("utf8", 512, 512 + UPDATE_INFORMATION.length), UPDATE_INFORMATION);
  assert.equal(result[512 + UPDATE_INFORMATION.length], 0);
  assert.equal(original[512], 0);
});

test("reject malformed runtimes and oversized update information", () => {
  assert.throws(() => embedUpdateInformation(Buffer.alloc(64)), /ELF64/);
  const missing = runtimeFixture();
  missing.writeUInt32LE(0, 192);
  assert.throws(() => embedUpdateInformation(missing), /no .upd_info/);
  assert.throws(() => embedUpdateInformation(runtimeFixture(), "x".repeat(256)), /does not fit/);
  const invalid = runtimeFixture();
  invalid.writeBigUInt64LE(99999n, 192 + 24);
  assert.throws(() => embedUpdateInformation(invalid), /bounds/);
});

test("Linux update hooks do not affect Windows/macOS artifacts", async () => {
  await prepareAppImage({ electronPlatformName: "win32" });
  await prepareAppImage({ electronPlatformName: "darwin" });
  assert.deepEqual(await createZsync({ artifactPaths: ["Lane.exe", "Lane.dmg", "latest.yml"] }), []);
});
