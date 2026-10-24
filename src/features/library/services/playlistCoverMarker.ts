// The server keeps only a title and a description for user playlists. To give
// an imported playlist its original cover on every device, the cover's URL is
// stored at the end of the description behind an invisible separator; the app
// reads it back and never shows it.
const SEP = "⁣";
const MARK = /\s*⁣lane-cover:(\S+)\s*$/;

export function readCoverMarker(description: string | null | undefined): string | undefined {
  const url = description ? MARK.exec(description)?.[1] : undefined;
  return url && /^https?:\/\//.test(url) ? url : undefined;
}

export function stripCoverMarker(description: string | null | undefined): string {
  return (description ?? "").replace(MARK, "").trim();
}

export function withCoverMarker(description: string | null | undefined, coverUrl: string | undefined): string {
  const text = stripCoverMarker(description);
  if (!coverUrl) return text;
  return `${text}${text ? "\n\n" : ""}${SEP}lane-cover:${coverUrl}`;
}
