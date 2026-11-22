import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AddLine, Edit2Line, ExitLine } from "@mingcute/react";
import { useAuthStore } from "@/features/auth";
import { useTranslation } from "@/languages";
import { onAndroidBack } from "@/shared/platform/androidBack";
import { useIsMobile } from "@/shared/hooks/useIsMobile";
import UserAvatar from "@/shared/ui/UserAvatar";
import Dialog from "@/shared/ui/Dialog";
import ToggleSwitch from "@/shared/ui/ToggleSwitch";
import AvatarEditor from "./AvatarEditor";
import ImageCropDialog from "./ImageCropDialog";
import { loadCropSource, type CropSource } from "./imageCrop";
import { emptyProfile, profileOwner, profileRequest, type ProfileCustomization } from "../store/profileCustomization";
import "./profile.css";

export default function ProfileTab() {
  const user = useAuthStore(state => state.user);
  // Remount all drafts and pending requests when the signed-in account changes.
  return <ProfileContent key={`${profileOwner()}:${user?.id}`} />;
}

function ProfileContent() {
  const isMobile = useIsMobile();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore(state => state.user);
  const owner = profileOwner();
  const [profile, setProfile] = useState<ProfileCustomization>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [editor, setEditor] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const bioInput = useRef<HTMLTextAreaElement>(null);
  const [busy, setBusy] = useState(false);
  const mutation = useRef(false);
  const [error, setError] = useState("");
  const bannerInput = useRef<HTMLInputElement>(null);
  const [bannerSource, setBannerSource] = useState<CropSource | null>(null);
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
    profileRequest(owner, undefined, controller.signal).then(setProfile).catch(() => {
      if (!controller.signal.aborted) setLoadFailed(true);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [owner, reload]);

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
    try { setProfile(await profileRequest(owner, patch)); }
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

  return <div className="lane-profile">
    <input ref={bannerInput} type="file" accept="image/*" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void uploadBanner(file); }} />
    <section className="lane-profile-card">
      <button type="button" className={`lane-profile-banner lane-profile-banner-upload ${profile.banner ? "has-image" : ""}`} style={profile.banner ? { backgroundImage: `url(${profile.banner})` } : undefined} disabled={unavailable} aria-label={t("settings.profile.upload_banner_hint")} onClick={() => bannerInput.current?.click()}>
        <span className="lane-profile-upload-hint"><AddLine size={22} />{t("settings.profile.upload_banner_hint")}</span>
      </button>
      <div className="lane-profile-card-body">
        <div className="lane-profile-identity"><AvatarEditor disabled={busy} trigger={<><UserAvatar user={user} size={96} className="lane-profile-avatar" /><span className="lane-profile-upload-hint"><AddLine size={22} /><span>{t("settings.profile.upload_avatar_hint")}</span></span></>} /><div><div className="lane-profile-name"><h2>{displayName}</h2><button className="lane-profile-icon" disabled={!user || busy} onClick={openEditor} aria-label={t("settings.profile.edit")} title={t("settings.profile.edit")}><Edit2Line size={18} /></button></div><p>{user?.username ? `@${user.username}` : user?.email}</p></div></div>
        {user?.bio && <button className="lane-profile-bio has-bio" disabled={busy} onClick={openEditor}><span>{user.bio}</span></button>}
      </div>
    </section>
    {loading && <p role="status" className="lane-profile-note">{t("settings.profile.loading")}</p>}
    {loadFailed && <div role="alert" className="lane-profile-note">{t("settings.profile.load_failed")} <button className="lane-profile-button" onClick={() => setReload(value => value + 1)}>{t("settings.profile.retry")}</button></div>}
    {error && !editor && <p role="alert" className="lane-profile-error">{error}</p>}
    {user && <button className="lane-profile-signout" disabled={busy} onClick={async () => { setBusy(true); try { await useAuthStore.getState().logout(); navigate("/", { replace: true }); } catch { setError(t("settings.profile.save_failed")); } finally { setBusy(false); } }}><ExitLine size={18} />{t("settings.profile.sign_out")}</button>}
    {bannerSource && <ImageCropDialog key={bannerSource.url} source={bannerSource} kind="banner" onClose={() => setBannerSource(null)} onSave={banner => saveCustomization({ banner })} />}

    <Dialog open={editor} bottomSheet={isMobile} closeOnBackdrop={false} closeOnEscape={false} aria-labelledby="lane-profile-editor-title" onOpenChange={open => { if (!busy) setEditor(open); }} maxWidth={680} maxHeight="90dvh" zIndex={220} className={`lane-profile-dialog ${isMobile ? "is-sheet" : "is-modal"}`}>
      <div data-sheet-handle={isMobile ? true : undefined} className={isMobile ? "lane-profile-sheet-handle" : undefined}>{isMobile && <div className="lane-profile-grabber" />}<div className="lane-profile-dialog-heading"><h3 id="lane-profile-editor-title">{t("settings.profile.edit")}</h3></div></div>
      <div className="lane-profile-editor-body"><form id="lane-profile-form" onSubmit={saveAbout}>
        <div className="lane-profile-account-fields">
        <label className="lane-profile-field"><span>{t("settings.profile.name")}<small>{name.length}/40</small></span><input maxLength={40} value={name} disabled={busy} placeholder={displayName} onChange={event => setName(event.target.value)} /></label>
        <label className="lane-profile-field"><span>{t("settings.profile.username")}</span><input required minLength={3} maxLength={30} pattern="[a-z0-9_]{3,30}" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={username} disabled={busy} onChange={event => setUsername(event.target.value)} /><small>{t("settings.profile.username_hint")}</small></label>
        </div>
        <label className="lane-profile-field"><span>{t("settings.profile.about_me")}<small>{bio.length}/280</small></span><textarea ref={bioInput} rows={3} maxLength={280} value={bio} disabled={busy} placeholder={t("settings.profile.bio_placeholder")} onChange={event => setBio(event.target.value)} /></label>
        <div className="lane-profile-privacy"><div><strong>{t("settings.profile.public_profile.title")}</strong><p>{t("settings.profile.public_profile.description")}</p></div><ToggleSwitch checked={isPublic} onChange={setIsPublic} disabled={busy} size="medium" ariaLabel={t("settings.profile.public_profile.title")} /></div>
        {error && <p role="alert" className="lane-profile-error">{error}</p>}</form></div>
      <div className="lane-profile-editor-footer"><button type="button" className="lane-profile-button" disabled={busy} onClick={() => setEditor(false)}>{t("common.close")}</button><button form="lane-profile-form" type="submit" className="lane-profile-button is-primary" disabled={busy}>{t(busy ? "settings.profile.saving" : "settings.profile.save")}</button></div>
    </Dialog>
  </div>;
}
