import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AddLine, CloseLine, Edit2Line, ExitLine, Share2Line } from "@mingcute/react";
import { useAuthStore } from "@/features/auth";
import { useTranslation } from "@/languages";
import { onAndroidBack } from "@/shared/platform/androidBack";
import { useIsMobile } from "@/shared/hooks/useIsMobile";
import UserAvatar from "@/shared/ui/UserAvatar";
import Dialog from "@/shared/ui/Dialog";
import ToggleSwitch from "@/shared/ui/ToggleSwitch";
import { shareEntity } from "@/shared/utils/share";
import { showToast } from "@/shared/ui/Toast";
import { resolveApiErrorMessage } from "@/shared/api/api";
import { api } from "@/shared/api";
import AvatarEditor from "./AvatarEditor";
import ProfileMusic from "./ProfileMusic";
import ProfileStats from "./ProfileStats";
import ProfileMusicPicker from "./ProfileMusicPicker";
import ImageCropDialog from "./ImageCropDialog";
import { loadCropSource, type CropSource } from "./imageCrop";
import { emptyProfile, profileOwner, profileRequest, type ProfileCustomization } from "../store/profileCustomization";
import { readProfileCache, writeProfileCache, type ProfileStatsSnapshot } from "../store/profileCache";
import "./profile.css";

export default function ProfileTab() {
  const user = useAuthStore(state => state.user);
  const owner = user ? profileOwner(user.id) : null;
  // Remount all drafts and pending requests when the signed-in account changes.
  return <ProfileContent key={`${owner}:${user?.id}`} owner={owner} />;
}

function ProfileContent({ owner }: { owner: string | null }) {
  const isMobile = useIsMobile();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore(state => state.user);
  const [loadedProfile, setProfile] = useState(() => readProfileCache(owner, "customization"));
  const profile = loadedProfile ?? emptyProfile;
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [stats, setStats] = useState(() => readProfileCache(owner, "stats"));
  const [statsFailed, setStatsFailed] = useState(false);
  const [statsReload, setStatsReload] = useState(0);
  const [editor, setEditor] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const bioInput = useRef<HTMLTextAreaElement>(null);
  const [busy, setBusy] = useState(false);
  const mutation = useRef(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState("");
  const bannerInput = useRef<HTMLInputElement>(null);
  const [bannerSource, setBannerSource] = useState<CropSource | null>(null);
  const [musicPicker, setMusicPicker] = useState(false);
  const active = useRef(true);
  const displayName = user?.displayName || user?.username || user?.email?.split("@")[0] || "Lane";

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  useEffect(() => () => { if (bannerSource) URL.revokeObjectURL(bannerSource.url); }, [bannerSource]);

  useEffect(() => {
    if (!owner) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true); setLoadFailed(false);
    profileRequest(owner, undefined, controller.signal).then(result => {
      if (controller.signal.aborted || profileOwner() !== owner) return;
      writeProfileCache(owner, "customization", result);
      setProfile(result);
    }).catch(() => {
      if (!controller.signal.aborted) setLoadFailed(true);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [owner, reload]);

  useEffect(() => {
    if (!owner || !user?.id) return;
    let current = true;
    setStatsFailed(false);
    void api.getUserProfile(user.id).then(result => {
      if (!current || profileOwner() !== owner) return;
      const { followersCount, listenedDurationMs, likedTracksCount } = result;
      const snapshot: ProfileStatsSnapshot = { followersCount, listenedDurationMs, likedTracksCount };
      writeProfileCache(owner, "stats", snapshot);
      setStats(snapshot);
    }).catch(() => {
      if (current) setStatsFailed(true);
    });
    return () => { current = false; };
  }, [owner, user?.id, statsReload]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "hidden") setStatsReload(value => value + 1);
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  useLayoutEffect(() => {
    const input = bioInput.current;
    if (!input) return;
    const resize = () => {
      input.style.height = "auto";
      input.style.height = `${input.scrollHeight}px`;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(input.parentElement!);
    return () => observer.disconnect();
  }, [bio, editor]);

  const openEditor = () => {
    setName(user?.displayName || ""); setUsername(user?.username || ""); setBio(user?.bio || "");
    setIsPublic(!!user?.isPublic);
    setError(""); setEditor(true);
  };
  useEffect(() => {
    if (!editor) return;
    // Keep drafts open: dismiss explicitly with Close or the sheet swipe.
    return onAndroidBack(() => true);
  }, [editor]);

  const saveCustomization = async (patch: Partial<ProfileCustomization>) => {
    if (!owner || mutation.current || loading || loadFailed) throw new Error("Profile unavailable");
    mutation.current = true; setBusy(true); setError("");
    try {
      const next = await profileRequest(owner, patch);
      if (profileOwner() === owner) {
        writeProfileCache(owner, "customization", next);
        if (active.current) setProfile(next);
      }
    }
    catch (cause) { setError(t("settings.profile.save_failed")); throw cause; }
    finally { mutation.current = false; setBusy(false); }
  };

  const uploadBanner = async (file?: File) => {
    if (!file || busy || !owner || loading || loadFailed) return;
    if (!file.type.startsWith("image/") || file.size > 20 * 1024 * 1024) { setError(t("settings.profile.avatar_invalid")); return; }
    // Banner storage has a smaller limit than avatar uploads.
    if (file.type === "image/gif" && file.size > 500 * 1024) { setError(`${t("settings.profile.upload_banner_hint")} (GIF ≤ 500 KB)`); return; }
    setBusy(true); setError("");
    try {
      const next = await loadCropSource(file);
      if (active.current) setBannerSource(next);
      else URL.revokeObjectURL(next.url);
    } catch { if (active.current) setError(t("settings.profile.avatar_invalid")); }
    finally { if (active.current) setBusy(false); }
  };

  const saveAbout = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || busy) return;
    setError("");
    if (!/^[a-z0-9_]{3,30}$/.test(username)) { setError(t("settings.profile.username_hint")); return; }
    setBusy(true); mutation.current = true;
    try {
      await useAuthStore.getState().updateProfile({ displayName: name.trim() || null, username, bio: bio.trim() || null, isPublic });
      setEditor(false);
    } catch { setError(t("settings.profile.save_failed")); }
    finally { setBusy(false); mutation.current = false; }
  };

  const unavailable = busy || loading || loadFailed || !user;
  const shareProfile = async () => {
    if (!user?.isPublic || !owner || sharing) return;
    setSharing(true);
    try {
      const result = await shareEntity("profile", owner, { title: displayName });
      if (result === "copied") showToast(t("sharing.copied"), "checkmark");
    } catch (cause) { showToast(resolveApiErrorMessage(cause, t, "sharing.failed"), "error"); }
    finally { if (active.current) setSharing(false); }
  };

  return <div className="lane-profile">
    <input ref={bannerInput} type="file" accept="image/*" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void uploadBanner(file); }} />
    <section className="lane-profile-card">
      <button type="button" className={`lane-profile-banner lane-profile-banner-upload ${profile.banner ? "has-image" : ""}`} style={profile.banner ? { backgroundImage: `url(${profile.banner})` } : undefined} disabled={unavailable} aria-label={t("settings.profile.upload_banner_hint")} onClick={() => bannerInput.current?.click()}>
        <span className="lane-profile-upload-hint"><AddLine size={22} />{t("settings.profile.upload_banner_hint")}</span>
      </button>
      <div className="lane-profile-card-body">
        <div className="lane-profile-identity">
          <AvatarEditor disabled={busy} trigger={<><UserAvatar user={user} size={96} className="lane-profile-avatar" /><span className="lane-profile-upload-hint"><AddLine size={22} /><span>{t("settings.profile.upload_avatar_hint")}</span></span></>} />
          <div className="lane-profile-account"><h2>{displayName}</h2><p>{user?.username ? `@${user.username}` : user?.email}</p></div>
        </div>
        {user?.bio && <button className="lane-profile-bio has-bio" disabled={busy} onClick={openEditor}><span>{user.bio}</span></button>}
        {user && <ProfileStats followersCount={stats?.followersCount} listenedDurationMs={stats?.listenedDurationMs} likedTracksCount={stats?.likedTracksCount} />}
        {statsFailed && <div role="alert" className="lane-profile-note">{t("settings.profile.load_failed")} <button type="button" className="lane-profile-button" onClick={() => setStatsReload(value => value + 1)}>{t("settings.profile.retry")}</button></div>}
        {user && !user.isPublic && <p className="lane-profile-note">{t("settings.profile.public_profile.description")}</p>}
        {user && <div className="lane-profile-header-actions">
          <button type="button" className="lane-profile-button" disabled={busy} onClick={openEditor} aria-label={t("settings.profile.edit")}><Edit2Line size={18} /><span>{t("settings.profile.edit")}</span></button>
          <button type="button" className="lane-profile-button" disabled={busy || sharing} onClick={() => { if (user.isPublic) void shareProfile(); else openEditor(); }} aria-label={t("common.share")}><Share2Line size={18} /><span>{t("common.share")}</span></button>
        </div>}
      </div>
    </section>
    {loading && !loadedProfile && <p role="status" className="lane-profile-note">{t("settings.profile.loading")}</p>}
    {loadFailed && <div role="alert" className="lane-profile-note">{t("settings.profile.load_failed")} <button className="lane-profile-button" onClick={() => setReload(value => value + 1)}>{t("settings.profile.retry")}</button></div>}
    {error && !editor && <p role="alert" className="lane-profile-error">{error}</p>}
    {user && <ProfileMusic artist={profile.artist} tracks={profile.tracks} disabled={unavailable} onChoose={() => setMusicPicker(true)} onRemoveArtist={() => saveCustomization({ artist: null, tracks: [] })} onRemoveTrack={() => saveCustomization({ tracks: [], artist: null })} />}
    {user && <button className="lane-profile-signout" disabled={busy} onClick={async () => { setBusy(true); try { await useAuthStore.getState().logout(); navigate("/", { replace: true }); } catch { setError(t("settings.profile.save_failed")); } finally { setBusy(false); } }}><ExitLine size={18} />{t("settings.profile.sign_out")}</button>}
    {bannerSource && <ImageCropDialog key={bannerSource.url} source={bannerSource} kind="banner" onClose={() => setBannerSource(null)} onSave={banner => saveCustomization({ banner })} />}
    {musicPicker && <ProfileMusicPicker trackIds={profile.tracks.map(track => track.id)} onClose={() => setMusicPicker(false)}
      onArtist={artist => {
        if (profile.artist || profile.tracks.length) return Promise.reject(new Error("Favorite already selected"));
        return saveCustomization({ artist, tracks: [] });
      }}
      onTrack={track => {
        if (profile.artist || profile.tracks.length) return Promise.reject(new Error("Favorite already selected"));
        return saveCustomization({ tracks: [track], artist: null });
      }} />}

    <Dialog open={editor} bottomSheet={isMobile} closeOnBackdrop={false} closeOnEscape={false} aria-labelledby="lane-profile-editor-title" onOpenChange={open => { if (!busy) setEditor(open); }} maxWidth={680} maxHeight="90dvh" zIndex={220} className={`lane-profile-dialog ${isMobile ? "is-sheet" : "is-modal"}`}>
      <div data-sheet-handle={isMobile ? true : undefined} className={isMobile ? "lane-profile-sheet-handle" : undefined}>{isMobile && <div className="lane-profile-grabber" />}<div className="lane-profile-dialog-heading"><h3 id="lane-profile-editor-title">{t("settings.profile.edit")}</h3>{!isMobile && <button type="button" className="inline-grid size-8 place-items-center border-0 bg-transparent text-text-secondary hover:text-text-primary" aria-label={t("common.close")} disabled={busy} onClick={() => setEditor(false)}><CloseLine size={22} /></button>}</div></div>
      <div className="lane-profile-editor-body"><form id="lane-profile-form" onSubmit={saveAbout}>
        <div className="lane-profile-account-fields">
        <label className="lane-profile-field"><span>{t("settings.profile.name")}<small>{name.length}/40</small></span><input maxLength={40} value={name} disabled={busy} placeholder={displayName} onChange={event => setName(event.target.value)} /></label>
        <label className="lane-profile-field"><span>{t("settings.profile.username")}</span><input required minLength={3} maxLength={30} pattern="[a-z0-9_]{3,30}" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={username} disabled={busy} onChange={event => setUsername(event.target.value)} /><small>{t("settings.profile.username_hint")}</small></label>
        </div>
        <label className="lane-profile-field"><span>{t("settings.profile.about_me")}<small>{bio.length}/280</small></span><textarea ref={bioInput} rows={3} maxLength={280} value={bio} disabled={busy} placeholder={t("settings.profile.bio_placeholder")} onChange={event => setBio(event.target.value)} /></label>
        <div className="lane-profile-privacy"><div><strong>{t("settings.profile.public_profile.title")}</strong><p>{t("settings.profile.public_profile.description")}</p></div><ToggleSwitch checked={isPublic} onChange={setIsPublic} disabled={busy} size="medium" ariaLabel={t("settings.profile.public_profile.title")} /></div>
        {error && <p role="alert" className="lane-profile-error">{error}</p>}</form></div>
      <div className="lane-profile-editor-footer"><button form="lane-profile-form" type="submit" className="lane-profile-button is-primary" disabled={busy}>{t(busy ? "settings.profile.saving" : "settings.profile.save")}</button></div>
    </Dialog>
  </div>;
}
