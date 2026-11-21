import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const RELEASE_NOTES_LIMIT = 5;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Keep the newest versioned top-level details blocks, without cutting an entry. */
export function trimReleaseNotes(source) {
  const blocks = [];
  let depth = 0;
  let start = -1;
  const tags = /<\/?details\b[^>]*>/gi;
  for (const match of source.matchAll(tags)) {
    if (/^<\/details/i.test(match[0])) {
      if (depth === 0) throw new Error("Unexpected </details> in release notes.");
      if (--depth === 0) blocks.push({ start, end: match.index + match[0].length });
    } else {
      if (depth++ === 0) start = match.index;
    }
  }
  if (depth !== 0) throw new Error("Unclosed <details> in release notes.");
  if (blocks.length === 0) throw new Error("No release entries found; refusing to rewrite the file.");

  const versions = new Set();
  const entries = blocks.map((block, index) => {
    if (index && source.slice(blocks[index - 1].end, block.start).trim()) {
      throw new Error("Unexpected text between release entries; refusing to discard it.");
    }
    const text = source.slice(block.start, block.end);
    const summary = text.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/i)?.[1];
    const version = summary?.match(/<strong>\s*(\d+\.\d+\.\d+)\s*<\/strong>/i)?.[1];
    if (!version) throw new Error("Every release summary must contain <strong>X.Y.Z</strong>.");
    if (versions.has(version)) throw new Error(`Duplicate release version: ${version}`);
    versions.add(version);
    return { version, text };
  });

  entries.sort((a, b) => {
    const left = a.version.split(".").map(Number);
    const right = b.version.split(".").map(Number);
    return right[0] - left[0] || right[1] - left[1] || right[2] - left[2];
  });
  const kept = entries.slice(0, RELEASE_NOTES_LIMIT).map(({ text }, index) =>
    text.replace(/^<details\b[^>]*>/i, index === 0 ? "<details open>" : "<details>")
  );
  const prefix = source.slice(0, blocks[0].start).trimEnd();
  const suffix = source.slice(blocks.at(-1).end).trim();
  return `${prefix}\n\n${kept.join("\n\n")}${suffix ? `\n\n${suffix}` : ""}\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.some((arg) => arg !== "--check")) throw new Error("Usage: node scripts/trim-release-notes.mjs [--check]");
    const file = resolve(root, ".github/RELEASE_NOTES.md");
    const source = readFileSync(file, "utf8");
    const trimmed = trimReleaseNotes(source);
    if (args.includes("--check")) {
      if (trimmed !== source) throw new Error("Release notes need normalization. Run: node scripts/trim-release-notes.mjs");
    } else if (trimmed !== source) {
      writeFileSync(file, trimmed);
    }
    console.log(`Release notes OK: at most ${RELEASE_NOTES_LIMIT} versions, newest first.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
