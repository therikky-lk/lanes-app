import { useTranslation } from "@/languages";

export interface ProfileStatsData {
  followersCount?: number | null;
  listenedDurationMs?: number | null;
  likedTracksCount?: number | null;
}

export default function ProfileStats({ followersCount, listenedDurationMs, likedTracksCount }: ProfileStatsData) {
  const { t, locale } = useTranslation();
  const number = (value?: number | null) => value == null || !Number.isFinite(value) ? "—" : new Intl.NumberFormat(locale).format(Math.max(0, value));
  const duration = () => {
    if (listenedDurationMs == null || !Number.isFinite(listenedDurationMs)) return "—";
    const minutes = Math.floor(Math.max(0, listenedDurationMs) / 60000);
    const hours = Math.floor(minutes / 60);
    const unit = (value: number, name: "hour" | "minute") => new Intl.NumberFormat(locale, { style: "unit", unit: name, unitDisplay: "short" }).format(value);
    return hours ? `${unit(hours, "hour")} ${unit(minutes % 60, "minute")}` : unit(minutes, "minute");
  };
  return <dl className="lane-profile-stats">
    <div><dt>{t("settings.profile.listening_time")}</dt><dd>{duration()}</dd></div>
    <div><dt>{t("settings.profile.liked_tracks")}</dt><dd>{number(likedTracksCount)}</dd></div>
    <div><dt>{t("settings.profile.followers")}</dt><dd>{number(followersCount)}</dd></div>
  </dl>;
}
