import type { ClientImportedPlaylist, ClientImportedTrack } from "../../importTypes";

export const MAX_SPOTIFY_CSV_BYTES = 16 * 1024 * 1024;

function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false, closedQuote = false;
  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') { quoted = false; closedQuote = true; }
      else field += char;
    } else if (char === "," || char === "\n" || char === "\r") {
      row.push(field);
      field = "";
      closedQuote = false;
      if (char !== ",") {
        rows.push(row);
        row = [];
        if (char === "\r" && text[i + 1] === "\n") i++;
      }
    } else if (char === '"' && !field && !closedQuote) {
      quoted = true;
    } else if (closedQuote || char === '"') {
      throw new Error("Invalid Exportify CSV");
    } else field += char;
  }
  if (quoted) throw new Error("Unclosed field in Exportify CSV");
  if (row.length || field || closedQuote) rows.push([...row, field]);
  return rows;
}

export function parseSpotifyCsv(text: string, filename: string): ClientImportedPlaylist {
  const [header = [], ...rows] = csvRows(text);
  const index = (label: string) => header.findIndex(column => column.trim().toLowerCase() === label);
  const uri = index("track uri"), name = index("track name"), artist = index("artist name(s)");
  const albumName = index("album name"), duration = index("track duration (ms)");
  if ([uri, name, artist].some(column => column < 0)) throw new Error("Expected a track CSV from Exportify");
  const tracks: ClientImportedTrack[] = [];
  for (const row of rows) {
    const id = /^spotify:track:([a-zA-Z0-9]+)$/.exec(row[uri]?.trim() ?? "")?.[1];
    const title = row[name]?.trim();
    const artists = (row[artist] ?? "").split(/(?<!\\),/).map(value => value.replace(/\\,/g, ",").trim()).filter(Boolean);
    if (!id || !title || !artists.length) continue;
    const album = row[albumName]?.trim();
    const durationMs = Number(row[duration]);
    tracks.push({ sourceId: id, title, artists, ...(album ? { album } : {}),
      ...(Number.isFinite(durationMs) && durationMs > 0 ? { durationMs } : {}) });
  }
  if (!tracks.length) throw new Error("The CSV contains no Spotify tracks");
  return { source: "spotify", sourceUrl: "", title: filename.replace(/\.csv$/i, "").trim() || "Spotify", tracks };
}
