import { useEffect, useRef, useState } from "react";
import { CloseLine, Edit2Line, ExitLine } from "@mingcute/react";
import { useAuthStore } from "@/features/auth";
import { useTranslation } from "@/languages";
import { onAndroidBack } from "@/shared/platform/androidBack";
import Dialog from "@/shared/ui/Dialog";
import Button from "@/shared/ui/Button";
import UserAvatar from "@/shared/ui/UserAvatar";
import { useLocalAvatar, useLocalAvatarStore } from "@/features/auth/store/localAvatarStore";
import { getAccessToken } from "@/shared/api";
import { LANE_LINK_ORIGIN } from "@/shared/api/baseUrl";

async function readAvatar(file: File): Promise<string> {
  if (!file.type.startsWith("image/") || file.size > 20 * 1024 * 1024) throw new Error("invalid image");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    const size = Math.min(image.naturalWidth, image.naturalHeight);
    ctx.drawImage(image, (image.naturalWidth - size) / 2, (image.naturalHeight - size) / 2, size, size, 0, 0, 256, 256);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally { URL.revokeObjectURL(url); }
}

export default function SettingsAccount({ onSignOut, compact = false }: { onSignOut: () => void; compact?: boolean }) {
  const { t } = useTranslation();
  const user = useAuthStore(state => state.user);
  const avatarUrl = useLocalAvatar(user?.id, user?.avatarUrl);
  const removeLocalAvatar = useLocalAvatarStore(state => state.removeAvatar);
  const logout = useAuthStore(state => state.logout);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  useEffect(() => { request.current++; setError(""); setBusy(false); }, [open, user?.id]);
  useEffect(() => () => { request.current++; }, []);
  useEffect(() => {
    if (open) return onAndroidBack(() => { setOpen(false); return true; });
  }, [open]);
  const displayName = user?.displayName || user?.username || user?.email?.split("@")[0] || "Lane";
  const selectFile = async (file: File) => {
    const id = ++request.current;
    setBusy(true); setError("");
    try {
      const result = await readAvatar(file);
      if (request.current === id && user) {
        const accessToken = getAccessToken();
        if (!accessToken) throw new Error("unauthorized");
        const response = await fetch(`${LANE_LINK_ORIGIN}/v1/me/avatar`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl: result }),
        });
        if (!response.ok) throw new Error("avatar upload failed");
        const uploaded = await response.json() as { avatarUrl?: string };
        if (!uploaded.avatarUrl) throw new Error("invalid avatar response");
        await useAuthStore.getState().updateProfile({ avatarUrl: uploaded.avatarUrl });
        if (request.current === id) removeLocalAvatar(user.id);
      }
    } catch { if (request.current === id) setError(t("settings.profile.save_failed")); }
    finally { if (request.current === id) setBusy(false); }
  };
  const removeAvatar = async () => {
    if (!user || busy) return;
    setBusy(true);
    setError("");
    try {
      const accessToken = getAccessToken();
      if (!accessToken) throw new Error("unauthorized");
      const response = await fetch(`${LANE_LINK_ORIGIN}/v1/me/avatar`, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
      if (!response.ok) throw new Error("avatar delete failed");
      await useAuthStore.getState().updateProfile({ avatarUrl: null });
      removeLocalAvatar(user.id);
    } catch { setError(t("settings.profile.save_failed")); }
    finally { setBusy(false); }
  };
  return <>
    <div className="flex min-w-0 max-w-full items-center gap-[10px]">
      <button type="button" aria-label={t("settings.profile.title")} aria-haspopup="dialog" onClick={() => setOpen(true)} className="flex h-[40px] w-[40px] shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary/50">
        <UserAvatar key={user?.avatarUrl} user={user} size={40} className="!rounded-full" />
      </button>
      {user && !compact && <span className="max-w-[160px] truncate text-[18px] font-[650] text-text-primary">{displayName}</span>}
    </div>
    <Dialog open={open} onOpenChange={setOpen} maxWidth={400} zIndex={250} className="p-0">
      <div className="flex w-full min-w-0 flex-col">
        <div className="flex items-center justify-between border-b border-border-primary/70 px-[24px] py-[18px]">
          <h2 className="m-0 text-[19px] font-semibold tracking-[-0.02em] text-text-primary">{t("settings.profile.title")}</h2>
          <button type="button" aria-label={t("common.close")} onClick={() => setOpen(false)} className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-text-tertiary transition-colors hover:bg-white/[0.07] hover:text-text-primary"><CloseLine size={21} /></button>
        </div>
        <div className="flex flex-col items-center px-[24px] pb-[22px] pt-[24px]">
          <div className="relative mb-[15px] rounded-full bg-gradient-to-br from-white/70 via-white/20 to-transparent p-[2px] shadow-[0_8px_28px_rgba(0,0,0,0.28)]">
            <button type="button" disabled={busy || !user} aria-label={t("settings.profile.change_avatar")} aria-busy={busy} onClick={() => fileInput.current?.click()} className="flex h-[96px] w-[96px] cursor-pointer overflow-hidden rounded-full border-0 bg-bg-elevated p-0 transition-transform duration-200 hover:scale-[1.03] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary/60">
              <UserAvatar user={user} size={96} className="!rounded-full" />
            </button>
            {avatarUrl && user && <button type="button" disabled={busy} aria-label={t("settings.profile.remove_avatar")} onClick={removeAvatar} className="absolute -right-[3px] top-[2px] flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-2 border-bg-primary bg-bg-elevated text-text-secondary shadow-lg transition-colors hover:text-text-primary disabled:opacity-50"><CloseLine size={15} /></button>}
          </div>
          <strong className="max-w-full truncate text-[20px] font-[650] tracking-[-0.02em] text-text-primary">{displayName}</strong>
          <span className="mt-[3px] max-w-full truncate text-[13px] text-text-tertiary">{user?.username ? `@${user.username}` : user?.email}</span>
          {user && <button type="button" disabled={busy} onClick={() => fileInput.current?.click()} className="mt-[14px] inline-flex h-[34px] items-center gap-[7px] rounded-full border border-border-primary bg-white/[0.035] px-[13px] text-[12px] font-medium text-text-secondary transition-colors hover:bg-white/[0.08] hover:text-text-primary disabled:opacity-50"><Edit2Line size={14} />{t("settings.profile.change_avatar")}</button>}
        </div>
        {user && <>
          <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void selectFile(file); }} />
          <div className="mx-[24px] mb-[16px] flex items-center justify-center gap-[8px] rounded-[11px] bg-white/[0.035] px-[12px] py-[10px] text-[12px] text-text-tertiary"><span className="h-[6px] w-[6px] shrink-0 rounded-full bg-emerald-400" />{t("settings.profile.avatar_local")}</div>
          {error && <p role="alert" className="mx-[24px] mb-[12px] mt-0 text-center text-[13px] text-red-400">{error}</p>}
          <div className="border-t border-border-primary/70 px-[24px] py-[16px]">
            <Button variant="secondary" disabled={busy} className="!h-[42px] !w-full !rounded-[12px] text-red-400 transition-colors hover:!bg-red-500/10" onClick={async () => { setBusy(true); setError(""); try { await logout(); setOpen(false); onSignOut(); } catch { setError(t("settings.profile.save_failed")); setBusy(false); } }}><ExitLine size={17} />{t("settings.profile.sign_out")}</Button>
          </div>
        </>}
      </div>
    </Dialog>
  </>;
}
