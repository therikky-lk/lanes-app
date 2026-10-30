// YouTube video titles often carry the artists and some noise:
//   "Джиган, Artik & Asti, NILETTO - Худи (Official Video)"
// Show just "Худи" when the artists are already shown next to it.

const JUNK = /\s*[([](?:official\s*(?:music\s*)?(?:video|audio|clip|visuali[sz]er|lyric\s*video)|official\s*remix|remix\s*official|music\s*video|lyric(?:s)?\s*video|lyrics|audio|video|visuali[sz]er|mood\s*video|премьера\s*клипа|премьера|клип|official|hd|hq|4k)[^)\]]*[)\]]/gi;
const TRAILING_JUNK = /\s*(?:[-–—|:]\s*)?(?:official\s*(?:music\s*)?(?:video|audio|clip|visuali[sz]er|lyric\s*video)|official\s*remix|remix\s*official|music\s*video|lyric(?:s)?\s*video|lyrics|audio|video|visuali[sz]er|mood\s*video|премьера\s*клипа|премьера|клип)\s*$/i;
const SOURCE_SUFFIX = /\s*[|–—-]\s*(?:трек\s*\+\s*текст|track\s*\+\s*text)\s*$/i;
const SEPARATOR = /\s+[-–—]\s+/;

function norm(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function artistNames(artists: string): string[] {
  return artists
    .split(/,|&|\bfeat\.?\b|\bft\.?\b|\bx\b|\band\b|\s+и\s+/i)
    .map((a) => norm(a))
    .filter((a) => a.length > 1);
}

/** the left side of "X - Y" names the artists when it mentions any of them */
function leftIsArtists(left: string, artists: string): boolean {
  const l = norm(left);
  if (!l) return false;
  const names = artistNames(artists);
  if (names.some((name) => l.includes(name) || name.includes(l))) return true;
  // transliterated names ("GeeGun" vs "Джиган") won't match: accept a list of
  // names that looks like the credits ("A, B & C") when there are several artists
  return names.length > 1 && /,|&/.test(left);
}

export function cleanTrackTitle(title: string, artists = ""): string {
  if (!title) return title;
  let out = title.replace(JUNK, "").replace(TRAILING_JUNK, "").replace(SOURCE_SUFFIX, "").trim();
  const parts = out.split(SEPARATOR);
  if (parts.length >= 2 && leftIsArtists(parts[0], artists)) {
    const rest = parts.slice(1).join(" - ").trim();
    if (rest) out = rest;
  }
  return out || title;
}
