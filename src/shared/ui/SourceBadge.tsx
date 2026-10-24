import { CloudFill, Folder2Fill, HeadphoneFill, PlayCircleFill } from "@mingcute/react";
import { isAudiusId } from "@/shared/media/audius";
import { isSoundCloudCatalogId } from "@/shared/media/soundcloud";
import { isLocalTrackId } from "@/shared/media/local/localTracks";
import { useTranslation } from "@/languages";

export type TrackSource = "youtube" | "soundcloud" | "audius" | "local";

/** where a track streams from, by its id */
export function trackSource(id: string | null | undefined): TrackSource {
  if (!id) return "youtube";
  if (isLocalTrackId(id)) return "local";
  if (isSoundCloudCatalogId(id)) return "soundcloud";
  if (isAudiusId(id)) return "audius";
  return "youtube";
}

const LABELS: Record<TrackSource, string> = {
  youtube: "YouTube Music",
  soundcloud: "SoundCloud",
  audius: "Audius",
  local: "",
};

// generic glyphs in each service's colour; the name is in the tooltip
const STYLE: Record<TrackSource, { color: string; Icon: typeof CloudFill }> = {
  youtube: { color: "#ff4e45", Icon: PlayCircleFill },
  soundcloud: { color: "#ff7a1a", Icon: CloudFill },
  audius: { color: "#a35cff", Icon: HeadphoneFill },
  local: { color: "#8e8e93", Icon: Folder2Fill },
};

interface SourceBadgeProps {
  trackId: string | null | undefined;
  size?: number;
  className?: string;
}

/** small icon telling where the track streams from */
export default function SourceBadge({ trackId, size = 13, className = "" }: SourceBadgeProps) {
  const { t } = useTranslation();
  const source = trackSource(trackId);
  const { color, Icon } = STYLE[source];
  const label = source === "local" ? t("local.title") || "My tracks" : `${t("common.source") || "Source"}: ${LABELS[source]}`;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ color }}
      title={label}
      aria-label={label}
      role="img"
      data-tooltip={label}
    >
      <Icon size={size} />
    </span>
  );
}
