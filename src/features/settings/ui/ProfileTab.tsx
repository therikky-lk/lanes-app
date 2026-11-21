import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AddLine, CloseLine, Edit2Line, ExitLine, EyeLine, LockLine, Music2Line, LinkLine, MicLine } from "@mingcute/react";
import { useAuthStore } from "@/features/auth";
import { useTranslation } from "@/languages";
import { onAndroidBack } from "@/shared/platform/androidBack";
import UserAvatar from "@/shared/ui/UserAvatar";
import Dialog from "@/shared/ui/Dialog";
import CoverImage from "@/features/covers/ui/CoverImage";
import { playerEngine } from "@/features/player";
import AvatarEditor from "./AvatarEditor";
import ProfileMusicPicker from "./ProfileMusicPicker";
import { emptyProfile, profileOwner, profileRequest, type ProfileCustomization } from "../store/profileCustomization";
import "./profile.css";

export default function ProfileTab() {
  const user = useAuthStore(state => state.user);
  // Remount all drafts and pending requests when the signed-in account changes.
  return <ProfileContent key={`${profileOwner()}:${user?.id}`} />;
}

function ProfileContent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore(state => state.user);
  const owner = profileOwner();
  const [profile, setProfile] = useState<ProfileCustomization>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [editor, setEditor] = useState(false);
  const [tab, setTab] = useState<"about" | "look" | "links">("about");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [links, setLinks] = useState<string[]>([]);
  const linksDirty = useRef(false);
  const [busy, setBusy] = useState(false);
  const mutation = useRef(false);
  const [error, setError] = useState("");
  const [picker, setPicker] = useState<"artist" | "track" | null>(null);
  const bannerInput = useRef<HTMLInputElement>(null);
  const displayName = user?.displayName || user?.username || user?.email?.split("@")[0] || "Lane";

  useEffect(() => {
    if (!owner) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true); setLoadFailed(false);
    profileRequest(owner, undefined, controller.signal).then(setProfile).catch(() => {
      if (!controller.signal.aborted) setLoadFailed(true);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [owner, reload]);

  const openEditor = (nextTab: typeof tab = "about") => {
    setName(user?.displayName || ""); setUsername(user?.username || ""); setBio(user?.bio || "");
    linksDirty.current = false; setLinks([...profile.links, "", "", ""].slice(0, 3)); setTab(nextTab); setError(""); setEditor(true);
  };
  useEffect(() => {
    if (!editor) return;
    return onAndroidBack(() => { if (!mutation.current) setEditor(false); return true; });
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
    const url = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = 400;
      const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Canvas unavailable");
      const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
      ctx.drawImage(image, (1200 - image.naturalWidth * scale) / 2, (400 - image.naturalHeight * scale) / 2, image.naturalWidth * scale, image.naturalHeight * scale);
      await saveCustomization({ banner: canvas.toDataURL("image/jpeg", 0.82) });
    } catch { setError(t("settings.profile.save_failed")); }
    finally { URL.revokeObjectURL(url); }
  };

  const saveAbout = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || busy) return;
    setError("");
    if (tab === "links") {
      const nextLinks = links.map(link => link.trim()).filter(Boolean);
      if (nextLinks.some(link => { try { const url = new URL(link); return url.protocol !== "https:" || !!url.username || !!url.password; } catch { return true; } })) { setError(t("settings.profile.invalid_link")); return; }
      try { await saveCustomization({ links: nextLinks }); setEditor(false); } catch {} return;
    }
    if (!/^[a-z0-9_]{3,30}$/.test(username)) { setError(t("settings.profile.username_hint")); return; }
    setBusy(true); mutation.current = true;
    try {
      await useAuthStore.getState().updateProfile({ displayName: name.trim() || null, username, bio: bio.trim() || null });
      setEditor(false);
    } catch { setError(t("settings.profile.save_failed")); }
    finally { setBusy(false); mutation.current = false; }
  };

  const togglePrivacy = async () => {
    if (busy || !user) return;
    setBusy(true); setError("");
    try { await useAuthStore.getState().updateProfile({ isPublic: !user.isPublic }); }
    catch { setError(t("settings.profile.save_failed")); }
    finally { setBusy(false); }
  };
  const unavailable = busy || loading || loadFailed || !user;

  return <div className="lane-profile">
    <input ref={bannerInput} type="file" accept="image/*" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void uploadBanner(file); }} />
    <section className="lane-profile-card">
      <div className={`lane-profile-banner ${profile.banner ? "has-image" : ""}`} style={profile.banner ? { backgroundImage: `url(${profile.banner})` } : undefined}>
        <button className="lane-profile-button lane-profile-banner-action" disabled={unavailable} onClick={() => bannerInput.current?.click()}><AddLine size={18} />{t(profile.banner ? "settings.profile.change_banner" : "settings.profile.add_banner")}</button>
      </div>
      <div className="lane-profile-card-body">
        <div className="lane-profile-identity"><UserAvatar user={user} size={96} className="lane-profile-avatar" /><div><h2>{displayName}</h2><p>{user?.username ? `@${user.username}` : user?.email}</p></div></div>
        <div className="lane-profile-actions"><button className="lane-profile-button" disabled={!user || busy} onClick={() => openEditor()}><Edit2Line size={18} />{t("settings.profile.edit")}</button><button className="lane-profile-button" disabled={!user || busy} onClick={() => void togglePrivacy()} aria-pressed={!!user?.isPublic}>{user?.isPublic ? <EyeLine size={18} /> : <LockLine size={18} />}{t(user?.isPublic ? "settings.profile.public" : "settings.profile.private")}</button></div>
        <button className={`lane-profile-bio ${user?.bio ? "has-bio" : ""}`} disabled={!user || busy} onClick={() => openEditor()}>{!user?.bio && <AddLine size={19} />}<span>{user?.bio || t("settings.profile.add_bio")}</span></button>
        {!!profile.links.length && <div className="lane-profile-links">{profile.links.map(link => <a key={link} href={link} target="_blank" rel="noopener noreferrer"><LinkLine size={15} />{new URL(link).hostname}</a>)}</div>}
      </div>
    </section>
    {loading && <p role="status" className="lane-profile-note">{t("settings.profile.loading")}</p>}
    {loadFailed && <div role="alert" className="lane-profile-note">{t("settings.profile.load_failed")} <button className="lane-profile-button" onClick={() => setReload(value => value + 1)}>{t("settings.profile.retry")}</button></div>}
    {error && !editor && !picker && <p role="alert" className="lane-profile-error">{error}</p>}
    <section className="lane-profile-favorites"><h3>{t("settings.profile.favorites")}</h3><div className={`lane-profile-favorites-card ${!profile.artist && !profile.tracks.length ? "is-empty" : ""}`}>
      {!profile.artist && !profile.tracks.length && <><span className="lane-profile-music-icon"><Music2Line size={30} /></span><h4>{t("settings.profile.music_question")}</h4><p>{t("settings.profile.music_hint")}</p></>}
      {profile.artist && <div className="lane-profile-selected"><button className="lane-profile-music-row" onClick={() => navigate(`/artist?id=${encodeURIComponent(profile.artist!.id)}`)}><span className="lane-profile-artwork is-artist">{profile.artist.coverUrl && <CoverImage src={profile.artist.coverUrl} alt="" />}</span><span><small>{t("settings.profile.favorite_artist")}</small><strong>{profile.artist.name}</strong></span></button><button className="lane-profile-icon" aria-label={t("settings.profile.remove_artist")} disabled={unavailable} onClick={() => { void saveCustomization({ artist: null }).catch(() => {}); }}><CloseLine size={18} /></button></div>}
      {profile.tracks.map(track => <div key={track.id} className="lane-profile-selected"><button className="lane-profile-music-row" onClick={() => { void playerEngine.playTrack(track, profile.tracks).catch(() => setError(t("settings.profile.play_failed"))); }}><span className="lane-profile-artwork">{track.coverUrl && <CoverImage src={track.coverUrl} alt="" />}</span><span><strong>{track.title}</strong><small>{track.artists}</small></span></button><button className="lane-profile-icon" disabled={unavailable} aria-label={t("settings.profile.remove_song", { title: track.title })} onClick={() => { void saveCustomization({ tracks: profile.tracks.filter(item => item.id !== track.id) }).catch(() => {}); }}><CloseLine size={18} /></button></div>)}
      <div className="lane-profile-actions">{!profile.artist && <button className="lane-profile-button" disabled={unavailable} onClick={() => setPicker("artist")}><MicLine size={19} />{t("settings.profile.choose_artist")}</button>}{profile.tracks.length < 3 && <button className="lane-profile-button" disabled={unavailable} onClick={() => setPicker("track")}><AddLine size={20} />{t("settings.profile.add_song")}</button>}</div>
    </div></section>
    {user && <button className="lane-profile-signout" disabled={busy} onClick={async () => { setBusy(true); try { await useAuthStore.getState().logout(); navigate("/", { replace: true }); } catch { setError(t("settings.profile.save_failed")); } finally { setBusy(false); } }}><ExitLine size={18} />{t("settings.profile.sign_out")}</button>}

    <Dialog open={editor} onOpenChange={open => { if (!busy) setEditor(open); }} maxWidth={580} maxHeight="90dvh" zIndex={220} className="lane-profile-dialog">
      <div className="lane-profile-grabber" /><div className="lane-profile-dialog-heading"><h3>{t("settings.profile.edit")}</h3><button className="lane-profile-icon" disabled={busy} aria-label={t("common.close")} onClick={() => setEditor(false)}><CloseLine size={23} /></button></div>
      <div className="lane-profile-editor-body"><div className="lane-profile-editor-summary"><UserAvatar user={user} size={62} className="!rounded-full !border-0" /><div><strong>{displayName}</strong><span>{user?.username ? `@${user.username}` : user?.email}</span></div></div>
      <div role="tablist" aria-label={t("settings.profile.edit")} className="lane-profile-tabs">{(["about", "look", "links"] as const).map(id => <button key={id} role="tab" id={`profile-tab-${id}`} aria-controls={`profile-panel-${id}`} aria-selected={tab === id} disabled={busy || (id === "links" && (loading || loadFailed))} onClick={() => { if (id === "links" && !linksDirty.current) setLinks([...profile.links, "", "", ""].slice(0, 3)); setTab(id); setError(""); }}>{t(`settings.profile.tab_${id}`)}</button>)}</div>
      <form id="lane-profile-form" onSubmit={saveAbout}><div role="tabpanel" id={`profile-panel-${tab}`} aria-labelledby={`profile-tab-${tab}`}>
        {tab === "about" && <><label className="lane-profile-field"><span>{t("settings.profile.name")}<small>{name.length}/40</small></span><input maxLength={40} value={name} disabled={busy} placeholder={displayName} onChange={event => setName(event.target.value)} /></label><label className="lane-profile-field"><span>{t("settings.profile.username")}</span><input required minLength={3} maxLength={30} pattern="[a-z0-9_]{3,30}" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={username} disabled={busy} onChange={event => setUsername(event.target.value)} /><small>{t("settings.profile.username_hint")}</small></label><label className="lane-profile-field"><span>{t("settings.profile.about_me")}<small>{bio.length}/280</small></span><textarea maxLength={280} value={bio} disabled={busy} placeholder={t("settings.profile.bio_placeholder")} onChange={event => setBio(event.target.value)} /></label></>}
        {tab === "look" && <div className="lane-profile-look"><h4>{t("settings.profile.avatar")}</h4><AvatarEditor /><h4>{t("settings.profile.banner")}</h4><div className="lane-profile-banner lane-profile-editor-banner" style={profile.banner ? { backgroundImage: `url(${profile.banner})` } : undefined} /><p className="lane-profile-note">{t("settings.profile.banner_hint")}</p><div className="lane-profile-actions"><button type="button" className="lane-profile-button" disabled={unavailable} onClick={() => bannerInput.current?.click()}><AddLine size={18} />{t("settings.profile.change_banner")}</button>{profile.banner && <button type="button" className="lane-profile-button" disabled={unavailable} onClick={() => { void saveCustomization({ banner: null }).catch(() => {}); }}>{t("settings.profile.remove_banner")}</button>}</div></div>}
        {tab === "links" && <><p className="lane-profile-note">{t("settings.profile.links_hint")}</p>{links.map((link, index) => <label key={index} className="lane-profile-field"><span>{t("settings.profile.link_number", { number: index + 1 })}</span><input type="url" maxLength={2048} placeholder="https://" disabled={unavailable} value={link} onChange={event => { linksDirty.current = true; setLinks(current => current.map((value, i) => i === index ? event.target.value : value)); }} /></label>)}</>}
      </div>{error && <p role="alert" className="lane-profile-error">{error}</p>}</form></div>
      {tab !== "look" && <div className="lane-profile-editor-footer"><button type="button" className="lane-profile-button" disabled={busy} onClick={() => setEditor(false)}>{t("common.cancel")}</button><button form="lane-profile-form" type="submit" className="lane-profile-button is-primary" disabled={busy || (tab === "links" && unavailable)}>{t(busy ? "settings.profile.saving" : "settings.profile.save")}</button></div>}
    </Dialog>
    {picker && <ProfileMusicPicker kind={picker} trackIds={profile.tracks.map(track => track.id)} onClose={() => { setPicker(null); setError(""); }} onArtist={artist => saveCustomization({ artist })} onTrack={track => saveCustomization({ tracks: [...profile.tracks, track].slice(0, 3) })} />}
  </div>;
}
