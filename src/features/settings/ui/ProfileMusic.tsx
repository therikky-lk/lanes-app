import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AddLine, CloseLine, PauseFill, PlayFill } from "@mingcute/react";
import { api, toClientTrack } from "@/shared/api";
import { playerEngine } from "@/features/player";
import { usePlayerStore } from "@/features/player/store/playerStore";
import CoverImage from "@/features/covers/ui/CoverImage";
import { useTranslation } from "@/languages";
import { showToast } from "@/shared/ui/Toast";
import type { Track } from "@/shared/types";
import type { ProfileArtist } from "../store/profileCustomization";
import { artistHref, canonicalArtistId } from "@/shared/media/artistIdentity";

interface Props {
  artist: ProfileArtist | null;
  tracks: Track[];
  disabled?: boolean;
  onChoose?: () => void;
  onRemoveArtist?: () => Promise<void>;
  onRemoveTrack?: (id: string) => Promise<void>;
  showEmpty?: boolean;
}

function playbackTime(ms: number) {
  const seconds = Math.floor(Math.max(0, Number.isFinite(ms) ? ms : 0) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function PlaybackProgress() {
  const { t } = useTranslation();
  const position = usePlayerStore(state => state.positionMs);
  const duration = usePlayerStore(state => state.durationMs || state.currentTrack?.durationMs || 0);
  const safeDuration = Number.isFinite(duration) ? Math.max(0, duration) : 0;
  const safePosition = Number.isFinite(position) ? Math.max(0, Math.min(position, safeDuration || Infinity)) : 0;
  return <div className="lane-profile-playback-progress">
    <progress aria-label={t("player.now_playing")} max={safeDuration || 1} value={safePosition} />
    <span><time>{playbackTime(safePosition)}</time><time>{playbackTime(safeDuration)}</time></span>
  </div>;
}

export default function ProfileMusic({ artist, tracks, disabled = false, onChoose, onRemoveArtist, onRemoveTrack, showEmpty = false }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const currentTrack = usePlayerStore(state => state.currentTrack);
  const status = usePlayerStore(state => state.status);
  const context = usePlayerStore(state => state.playbackContext);
  const track = tracks[0];
  const selectedArtist = track ? null : artist;
  const hasSelection = !!track || !!selectedArtist;
  const active = !!currentTrack && (track
    ? currentTrack.id === track.id
    : !!selectedArtist && (currentTrack.artistId === selectedArtist.id || currentTrack.artistList?.some(item => item.id === selectedArtist.id) || context === selectedArtist.name))
    && ["playing", "paused", "loading"].includes(status);
  const playing = active && status === "playing";
  const loading = busy || (active && status === "loading");
  const play = async (track?: Track) => {
    if (pending.current) return;
    if (active) { playerEngine.togglePlayPause(); return; }
    pending.current = true; setBusy(true);
    try {
      const queue = track ? [track] : (await api.getArtist(canonicalArtistId(selectedArtist!.id, selectedArtist!.name))).tracks
        .filter(item => !item.catalogUnavailable).map(toClientTrack);
      if (!queue.length) throw new Error("No playable tracks");
      await playerEngine.playTrack(track || queue[0], queue, selectedArtist && !track ? selectedArtist.name : t("settings.profile.favorites"), selectedArtist && !track ? selectedArtist.coverUrl : track?.coverUrl);
    } catch { showToast(t("settings.profile.play_failed"), "error"); }
    finally { pending.current = false; setBusy(false); }
  };
  if (!onChoose && !hasSelection) return showEmpty ? <section className="lane-profile-favorites"><h3>{t("settings.profile.favorites")}</h3><div className="lane-profile-favorites-card is-empty"><p className="lane-profile-note">{t("settings.profile.music_empty")}</p></div></section> : null;
  if (onChoose && !hasSelection) return <section className="lane-profile-favorites">
    <h3>{t("settings.profile.favorites")}</h3>
    <button type="button" className="lane-profile-favorites-card is-empty lane-profile-music-trigger" disabled={disabled} aria-label={t("settings.profile.favorites")} aria-haspopup="dialog" onClick={onChoose}>
      <AddLine size={24} aria-hidden="true" /><span>{t("settings.profile.music_hint")}</span>
    </button>
  </section>;
  return <section className="lane-profile-favorites">
    <h3>{t(selectedArtist ? "settings.profile.favorite_artist" : track ? "settings.profile.favorite_track" : "settings.profile.favorites")}</h3>
    <div className={`lane-profile-favorites-card ${!hasSelection ? "is-empty" : ""}`} data-playback-state={active ? status : undefined} aria-busy={loading}>
      {selectedArtist && <div className="lane-profile-music-item">
        <button type="button" className="lane-profile-music-row" onClick={() => navigate(artistHref(selectedArtist.id, selectedArtist.name))}>
          <span className="lane-profile-artwork is-artist">{selectedArtist.coverUrl && <CoverImage src={selectedArtist.coverUrl} alt="" />}</span>
          <span><strong>{selectedArtist.name}</strong></span>
        </button>
        <button type="button" className="lane-profile-icon" disabled={loading} aria-label={`${t(playing ? "common.pause" : "common.play")}: ${selectedArtist.name}`} onClick={() => void play()}>{playing ? <PauseFill size={18} /> : <PlayFill size={18} />}</button>
        {onRemoveArtist && <button type="button" className="lane-profile-icon lane-profile-remove" disabled={disabled} aria-label={t("settings.profile.remove_artist")} onClick={() => { void onRemoveArtist().catch(() => {}); }}><CloseLine size={18} /></button>}
      </div>}
      {track && <div className="lane-profile-music-item">
        <button type="button" className="lane-profile-music-row" disabled={loading} aria-label={`${t(playing ? "common.pause" : "common.play")}: ${track.title}`} onClick={() => void play(track)}>
          <span className="lane-profile-artwork">{track.coverUrl && <CoverImage src={track.coverUrl} alt="" />}</span>
          <span><strong>{track.title}</strong><small>{track.artists}</small></span>{playing ? <PauseFill size={18} /> : <PlayFill size={18} />}
        </button>
        {onRemoveTrack && <button type="button" className="lane-profile-icon lane-profile-remove" disabled={disabled} aria-label={t("settings.profile.remove_song", { title: track.title })} onClick={() => { void onRemoveTrack(track.id).catch(() => {}); }}><CloseLine size={18} /></button>}
      </div>}
      {active && <div className="lane-profile-playback">
        {selectedArtist && <p className="lane-profile-current-song">{currentTrack?.title}</p>}
        <PlaybackProgress />
      </div>}
    </div>
  </section>;
}
