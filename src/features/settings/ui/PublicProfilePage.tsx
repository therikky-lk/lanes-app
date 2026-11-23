import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeftLine } from "@mingcute/react";
import { api } from "@/shared/api";
import type { UserProfile } from "@/shared/contracts/users";
import { useAuthStore } from "@/features/auth";
import type { SharedEntity } from "@/shared/contracts/sharing";
import { useTranslation } from "@/languages";
import UserAvatar from "@/shared/ui/UserAvatar";
import ProfileMusic from "./ProfileMusic";
import ProfileMusicPicker from "./ProfileMusicPicker";
import ProfileStats from "./ProfileStats";
import { profileOwner, profileRequest, type ProfileCustomization } from "../store/profileCustomization";
import { showToast } from "@/shared/ui/Toast";
import "./profile.css";
import { getTrackCommentProfile } from "@/features/player/ui/TrackComments";

export default function PublicProfilePage() {
  const [params] = useSearchParams();
  const id = params.get("share") || "";
  const commentTrack = params.get("commentTrack") || "";
  const commentId = Number(params.get("comment"));
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore(state => state.user);
  const viewerOwner = profileOwner();
  const [share, setShare] = useState<SharedEntity | null>(null);
  const [failed, setFailed] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [retry, setRetry] = useState(0);
  const [social, setSocial] = useState<UserProfile | null>(null);
  const [socialFailed, setSocialFailed] = useState(false);
  const [following, setFollowing] = useState(false);
  const [editingMusic, setEditingMusic] = useState(false);
  const [savingMusic, setSavingMusic] = useState(false);
  const mutation = useRef(false);
  const followMutation = useRef(false);
  const active = useRef(true);
  const currentTarget = useRef<string | null>(null);
  const socialRevision = useRef(0);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const backendOf = (result: SharedEntity) => result.profile?.authBackend || result.entityId?.split(":")[0] || "liner";

  useEffect(() => {
    let active = true;
    const revision = ++socialRevision.current;
    setShare(null); setFailed(false); setUnavailable(false);
    setSocial(null); setSocialFailed(false); setEditingMusic(false);
    const controller = new AbortController();
    if (commentTrack ? !viewerOwner : !/^[A-Za-z0-9_-]{22}$/.test(id)) { setFailed(true); return; }
    const lookup = commentTrack && viewerOwner ? getTrackCommentProfile(commentTrack, commentId, viewerOwner, controller.signal) : api.getShare(id);
    void lookup.then(async result => {
      if (result.type !== "profile" || !result.profile) throw new Error("Profile unavailable");
      if (active) setShare(result);
      // A token is only sent to the account service where this viewer signed in.
      if (!viewerOwner || viewerOwner.split(":")[0] !== backendOf(result)) return;
      try {
        const details = await api.getUserProfile(result.profile.id);
        if (active && revision === socialRevision.current) setSocial(details);
      } catch { if (active) setSocialFailed(true); }
    }).catch(cause => {
      if (!active) return;
      setUnavailable(!!cause && typeof cause === "object" && "status" in cause && [401, 403, 404].includes(cause.status));
      setFailed(true);
    });
    return () => { active = false; controller.abort(); };
  }, [id, commentTrack, commentId, retry, viewerOwner]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "hidden" && !followMutation.current && !mutation.current) setRetry(value => value + 1);
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  const profile = share?.profile;
  const targetOwner = profile && share ? `${backendOf(share)}:${profile.id}` : null;
  currentTarget.current = targetOwner;
  const own = !!user && viewerOwner === targetOwner;
  const sameBackend = !!viewerOwner && !!share && viewerOwner.split(":")[0] === backendOf(share);
  const saveMusic = async (patch: Partial<ProfileCustomization>) => {
    if (!own || !targetOwner || profileOwner() !== targetOwner || mutation.current) throw new Error("Profile unavailable");
    mutation.current = true; setSavingMusic(true);
    try {
      const next = await profileRequest(targetOwner, patch);
      if (active.current && currentTarget.current === targetOwner) setShare(previous => previous?.profile ? { ...previous, profile: { ...previous.profile, artist: next.artist, tracks: next.tracks } } : previous);
    } finally { mutation.current = false; if (active.current) setSavingMusic(false); }
  };
  const toggleFollow = async () => {
    if (!profile || own || !sameBackend || !social || followMutation.current) return;
    followMutation.current = true; setFollowing(true);
    const revision = ++socialRevision.current;
    const previous = !!social.isFollowing;
    const account = viewerOwner;
    try {
      const receipt = previous ? await api.unfollowUser(profile.id) : await api.followUser(profile.id);
      if (!active.current || profileOwner() !== account || currentTarget.current !== targetOwner) return;
      if (receipt && typeof receipt.isFollowing === "boolean" && Number.isFinite(receipt.followersCount)) {
        // The mutation returns a fresh database snapshot. Do not overwrite it
        // with a separate, potentially stale read made before the write.
        setSocial(current => current ? { ...current, ...receipt } : current);
        return;
      }
      // Legacy services acknowledge mutations with 204 instead of a snapshot.
      setSocial(current => current ? { ...current, isFollowing: !previous, followersCount: Math.max(0, current.followersCount + (previous ? -1 : 1)) } : current);
      const next = await api.getUserProfile(profile.id).catch(() => null);
      if (next && next.isFollowing === !previous && active.current && profileOwner() === account && currentTarget.current === targetOwner && revision === socialRevision.current) setSocial(next);
    } catch { if (active.current) showToast(t("settings.profile.follow_failed"), "error"); }
    finally { followMutation.current = false; if (active.current) setFollowing(false); }
  };
  return <div className="lane-profile lane-public-profile">
    <button type="button" className="lane-profile-button lane-public-profile-back" onClick={() => navigate(-1)}><ArrowLeftLine size={18} />{t("common.back")}</button>
    {failed ? <div role="alert" className="lane-profile-note">{t(unavailable ? "settings.profile.unavailable" : "sharing.open_failed")} <button className="lane-profile-button" onClick={() => setRetry(value => value + 1)}>{t("settings.profile.retry")}</button></div>
      : !profile ? <p role="status" className="lane-profile-note">{t("settings.profile.loading")}</p>
      : <><section className="lane-profile-card">
        <div className="lane-profile-banner" style={profile.banner ? { backgroundImage: `url(${profile.banner})` } : undefined} />
        <div className="lane-profile-card-body">
           <div className="lane-profile-identity"><UserAvatar user={{ avatarUrl: profile.avatarUrl, displayName: profile.displayName, username: profile.username }} size={96} className="lane-profile-avatar" /><div><h2>{profile.displayName || profile.username || "Lane"}</h2>{profile.username && <p>@{profile.username}</p>}</div></div>
          {profile.bio && <div className="lane-profile-bio has-bio"><span>{profile.bio}</span></div>}
          <ProfileStats followersCount={social?.followersCount ?? profile.followersCount} listenedDurationMs={social?.listenedDurationMs ?? profile.listenedDurationMs} likedTracksCount={social?.likedTracksCount ?? profile.likedTracksCount} />
          {!own && <div className="lane-profile-actions lane-profile-follow-actions"><button type="button" className="lane-profile-button is-primary" disabled={following || !social || !sameBackend} onClick={() => void toggleFollow()}>{t(social?.isFollowing ? "settings.profile.unfollow" : "settings.profile.follow")}</button></div>}
          {!own && !sameBackend && <p className="lane-profile-note">{t("settings.profile.follow_other_service")}</p>}
          {socialFailed && <p role="alert" className="lane-profile-note">{t("settings.profile.follow_failed")} <button type="button" className="lane-profile-button" onClick={() => setRetry(value => value + 1)}>{t("settings.profile.retry")}</button></p>}
        </div>
      </section><ProfileMusic artist={profile.artist || null} tracks={profile.tracks || []} showEmpty disabled={savingMusic}
        onChoose={own ? () => setEditingMusic(true) : undefined}
        onRemoveArtist={own ? () => saveMusic({ artist: null, tracks: [] }) : undefined}
        onRemoveTrack={own ? () => saveMusic({ artist: null, tracks: [] }) : undefined} />
        {own && editingMusic && <ProfileMusicPicker trackIds={profile.tracks?.map(track => track.id) || []} onClose={() => setEditingMusic(false)}
          onTrack={track => {
            if (profile.artist || profile.tracks?.length) return Promise.reject(new Error("Favorite already selected"));
            return saveMusic({ tracks: [track], artist: null });
          }}
          onArtist={artist => {
            if (profile.artist || profile.tracks?.length) return Promise.reject(new Error("Favorite already selected"));
            return saveMusic({ artist, tracks: [] });
          }} />}</>}
  </div>;
}
