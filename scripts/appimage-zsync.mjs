import { execFileSync } from "node:child_process";
import { basename } from "node:path";

export default async function createZsync(result) {
  const files = result.artifactPaths.filter((file) => file.endsWith(".AppImage"));
  const artifacts = [];
  for (const file of files) {
    const output = `${file}.zsync`;
    // Only reads the FINAL image, including electron-updater's blockmap.
    // The rolling `releases` tag is preserved; `latest` resolves to that release.
    const url = `https://github.com/therikky-lk/lanes-app/releases/download/releases/${basename(file)}`;
    execFileSync("zsyncmake", ["-u", url, "-o", output, file], { stdio: "inherit" });
    artifacts.push(output);
  }
  return artifacts;
}
