import { useEffect, useState } from "react";
import { CloseLine, Search2Line } from "@mingcute/react";
import { useTranslation } from "@/languages";
import { useSearchTracks } from "@/features/search/hooks/useSearchTracks";
import { useSearchArtists } from "@/features/search/hooks/useSearchArtists";
import CoverImage from "@/features/covers/ui/CoverImage";
import Dialog from "@/shared/ui/Dialog";
import { onAndroidBack } from "@/shared/platform/androidBack";
import type { Track } from "@/shared/types";
import type { ProfileArtist } from "../store/profileCustomization";

export default function ProfileMusicPicker({ kind, trackIds, onTrack, onArtist, onClose }: {
  kind: "artist" | "track"; trackIds: string[];
  onTrack: (track: Track) => Promise<void>; onArtist: (artist: ProfileArtist) => Promise<void>; onClose: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const tracks = useSearchTracks(query, { enabled: kind === "track" });
  const artists = useSearchArtists(query, { enabled: kind === "artist" });
  const search = kind === "track" ? tracks : artists;
  const items = kind === "track"
    ? tracks.tracks.filter(track => !track.id.startsWith("local:")).map(track => ({ id: track.id, title: track.title, subtitle: track.artists, cover: track.coverUrl, select: () => onTrack(track) }))
    : artists.artists.map(artist => ({ id: artist.id, title: artist.name, subtitle: t("settings.profile.favorite_artist"), cover: artist.cover?.url || "", select: () => onArtist({ id: artist.id, name: artist.name, coverUrl: artist.cover?.url || "" }) }));
  useEffect(() => onAndroidBack(() => { if (!busy) onClose(); return true; }), [onClose, busy]);
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }} maxWidth={520} zIndex={240} className="lane-profile-dialog">
    <div className="lane-profile-dialog-heading"><h3>{t(kind === "artist" ? "settings.profile.choose_artist" : "settings.profile.add_song")}</h3><button className="lane-profile-icon" aria-label={t("common.close")} disabled={busy} onClick={onClose}><CloseLine size={22} /></button></div>
    <div className="lane-profile-search"><Search2Line size={19} /><input autoFocus aria-label={t("settings.search_placeholder")} placeholder={t("settings.search_placeholder")} value={query} onChange={event => setQuery(event.target.value)} /></div>
    <div className="lane-profile-results" aria-busy={search.loading || busy}>
      {query.trim().length < 2 ? <p>{t("settings.profile.search_hint")}</p> : search.loading ? <p>{t("settings.profile.searching")}</p> : search.error ? <p role="alert">{t("settings.profile.search_failed")}</p> : !items.length ? <p>{t("search.no_results")}</p> : items.slice(0, 20).map(item => <button key={item.id} className="lane-profile-music-row" disabled={busy || (kind === "track" && trackIds.includes(item.id))} onClick={async () => {
        setBusy(true); setFailed(false);
        try { await item.select(); onClose(); } catch { setFailed(true); } finally { setBusy(false); }
      }}><span className={`lane-profile-artwork ${kind === "artist" ? "is-artist" : ""}`}>{item.cover && <CoverImage src={item.cover} alt="" />}</span><span><strong>{item.title}</strong><small>{item.subtitle}</small></span></button>)}
      {failed && <p role="alert">{t("settings.profile.save_failed")}</p>}
    </div>
  </Dialog>;
}
