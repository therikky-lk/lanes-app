import { createRequire } from "node:module";
import { cp, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { embedUpdateInformation } from "./appimage-update-info.mjs";

export default async function prepareAppImage(context) {
  if (context.electronPlatformName !== "linux") return;
  if (context.arch !== 1) throw new Error("Lane AppImage packaging currently supports x64 only");

  // Resolve through electron-builder so this works with pnpm's strict layout.
  // This toolset API is verified against the locked app-builder-lib 26.15.3.
  const require = createRequire(import.meta.url);
  const builderRequire = createRequire(require.resolve("electron-builder"));
  const { getAppImageTools } = builderRequire("app-builder-lib/out/toolsets/linux.js");
  const version = context.packager.config.toolsets?.appimage;
  if (version !== "1.0.3") throw new Error("Revalidate AppImage hooks before changing the toolset");
  const tools = await getAppImageTools(version, context.arch);
  // Never modify electron-builder's shared download cache or the app's files.
  // getTempFile lives in the builder-managed temporary directory (auto-cleaned).
  const destination = await context.packager.getTempFile("appimage-tools");
  await cp(dirname(tools.mksquashfs), destination, { recursive: true });
  const runtime = join(destination, "runtimes", "runtime-x64");
  await writeFile(runtime, embedUpdateInformation(await readFile(runtime)));
  process.env.APPIMAGE_TOOLS_PATH = destination;
}
