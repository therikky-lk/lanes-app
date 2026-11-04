import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localeSource = fs.readFileSync(path.join(root, "src/languages/locale.ts"), "utf8");
const locales = [...localeSource.match(/SUPPORTED_LOCALES = \[([\s\S]*?)\]/)[1].matchAll(/"([a-z]+)"/g)].map(match => match[1]);
function flatten(object, prefix = "", out = {}) {
  for (const [key, value] of Object.entries(object)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) flatten(value, full, out);
    else out[full] = value;
  }
  return out;
}
const dictionaries = Object.fromEntries(locales.map(locale => [locale, flatten(JSON.parse(fs.readFileSync(path.join(root, `src/languages/locales/${locale}.json`), "utf8")))]));
const base = dictionaries.en;
const errors = [];
const placeholders = value => [...value.matchAll(/\{([^{}]+)\}/g)].map(match => match[1]).sort().join(",");
for (const [locale, dictionary] of Object.entries(dictionaries)) {
  for (const [key, template] of Object.entries(base)) {
    const value = dictionary[key];
    if (typeof value !== "string" || !value.trim()) errors.push(`${locale}: missing or empty ${key}`);
    else if (placeholders(value) !== placeholders(template)) errors.push(`${locale}: placeholders differ for ${key}`);
  }
  // Plural forms specific to a locale must retain their count parameter too.
  for (const [key, value] of Object.entries(dictionary)) {
    if (typeof value !== "string" || !value.trim()) errors.push(`${locale}: invalid ${key}`);
    if (/_(?:zero|one|two|few|many|other|plural)$/.test(key) && value.includes("{count}") === false && dictionaries.en[key]?.includes("{count}")) errors.push(`${locale}: missing count in ${key}`);
  }
}
function inspect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) inspect(file);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      const source = fs.readFileSync(file, "utf8");
      for (const match of source.matchAll(/\b(?:t|tr)\(["']([^"']+)["']/g)) {
        if (!(match[1] in base)) errors.push(`${path.relative(root, file)}: unknown translation ${match[1]}`);
      }
    }
  }
}
inspect(path.join(root, "src"));
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else console.log(`Translations OK: ${locales.length} locales, ${Object.keys(base).length} shared keys; placeholders and literal references match.`);
