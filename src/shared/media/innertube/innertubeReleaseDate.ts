import { asRecord, stringValue, walkRecords } from "@/shared/utils/json";
import { getText } from "./innertubeJson";

export function exactReleaseDate(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const date = value.trim().match(/^(\d{4}-\d{2}-\d{2})(?:$|T)/)?.[1];
    if (!date) continue;
    const time = Date.parse(date);
    if (Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date) return date;
  }
}

export function releaseDateFromDescription(description: string | undefined): string | undefined {
  return exactReleaseDate(description?.match(/(?:^|\n)Released on:\s*(\d{4}-\d{2}-\d{2})[ \t]*(?:\r?\n|$)/i)?.[1]);
}

/** YouTube's auto-generated track description contains the distributor's release day. */
export function releaseDateFromTrackPage(body: unknown): string | undefined {
  let date: string | undefined;
  walkRecords(body, (record) => {
    if (date) return true;
    const renderer = asRecord(record.expandableVideoDescriptionBodyRenderer);
    const primary = asRecord(record.videoSecondaryInfoRenderer);
    const description = getText(renderer?.descriptionBodyText) ??
      stringValue(asRecord(renderer?.attributedDescriptionBodyText)?.content) ??
      getText(primary?.description) ??
      stringValue(asRecord(primary?.attributedDescription)?.content);
    date = releaseDateFromDescription(description);
    return Boolean(date);
  });
  return date;
}
