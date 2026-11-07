// Run after the app's generated signer or version changes; no server keys are needed.
import { readFile, writeFile } from "node:fs/promises";
const source = await readFile(new URL("../electron/signer.ts", import.meta.url), "utf8");
const match = source.match(/SIGNER_WASM_BASE64\s*=\s*"([A-Za-z0-9+/=]+)"/);
if (!match) throw new Error("The Lane app signer was not found");
const wasm = Buffer.from(match[1], "base64");
if (!WebAssembly.validate(wasm)) throw new Error("Invalid Lane signer module");
await writeFile(new URL("./signer.wasm", import.meta.url), wasm);
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
await writeFile(new URL("./app-identity.json", import.meta.url), JSON.stringify({ userAgent: `LaneShare/${pkg.version} lane/${pkg.version} Electron/${pkg.devDependencies.electron.replace(/^[~^]/, "")}` }, null, 2) + "\n");
console.log("Lane account signer synchronized");
