import { useEffect, useRef, useState } from "react";
import { Edit2Line } from "@mingcute/react";
import { useAuthStore } from "@/features/auth";
import { useLocalAvatarStore } from "@/features/auth/store/localAvatarStore";
import { useTranslation } from "@/languages";
import { getAccessToken, getAuthSession } from "@/shared/api";
import { getApiBaseUrlForAuthBackend, LANE_LINK_ORIGIN } from "@/shared/api/baseUrl";
import ImageCropDialog from "./ImageCropDialog";
import { loadCropSource, type CropSource } from "./imageCrop";

export default function AvatarEditor({ trigger, disabled = false }: { trigger?: React.ReactNode; disabled?: boolean }) {
  const { t } = useTranslation();
  const user = useAuthStore(state => state.user);
  const removeLocalAvatar = useLocalAvatarStore(state => state.removeAvatar);
  const fileInput = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<CropSource | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  useEffect(() => () => { if (source) URL.revokeObjectURL(source.url); }, [source]);

  const chooseImage = async (file?: File) => {
    if (!file || busy || disabled) return;
    if (!file.type.startsWith("image/") || file.size > (file.type === "image/gif" ? 5 : 15) * 1024 * 1024) {
      setError(t("settings.profile.avatar_upload_limits"));
      return;
    }
    setBusy(true); setError("");
    try {
      const next = await loadCropSource(file);
      if (active.current) setSource(next);
      else URL.revokeObjectURL(next.url);
    } catch { if (active.current) setError(t("settings.profile.avatar_upload_limits")); }
    finally { if (active.current) setBusy(false); }
  };

  const uploadAvatar = async (dataUrl: string) => {
    if (!user) throw new Error("Unauthorized");
    setBusy(true);
    try {
      const accessToken = getAccessToken();
      if (!accessToken) throw new Error("Unauthorized");
      const session = getAuthSession();
      const apiBaseUrl = getApiBaseUrlForAuthBackend(session?.authBackend);
      const response = await fetch(`${session?.authBackend === "hyprr" ? apiBaseUrl : LANE_LINK_ORIGIN}/v1/me/avatar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      if (!response.ok) throw new Error("Avatar upload failed");
      const uploaded = await response.json() as { avatarUrl?: string };
      if (!uploaded.avatarUrl) throw new Error("Invalid avatar response");
      const freshAvatarUrl = uploaded.avatarUrl.startsWith("data:")
        ? uploaded.avatarUrl
        : (() => {
          const url = new URL(uploaded.avatarUrl!, apiBaseUrl);
          url.searchParams.set("v", String(Date.now()));
          return url.toString();
        })();
      await useAuthStore.getState().updateProfile({ avatarUrl: freshAvatarUrl });
      removeLocalAvatar(user.id);
    } finally { if (active.current) setBusy(false); }
  };

  return <div className={trigger ? "lane-profile-avatar-editor" : "flex flex-col items-start"}>
    <input ref={fileInput} type="file" accept="image/*" hidden onChange={event => {
      const file = event.target.files?.[0]; event.target.value = ""; void chooseImage(file);
    }} />
    <button type="button" disabled={disabled || busy || !user} aria-label={t("settings.profile.change_avatar")}
      onClick={() => fileInput.current?.click()}
      className={trigger ? "lane-profile-avatar-upload" : "mt-[20px] inline-flex h-[44px] items-center gap-[8px] rounded-full border border-border-primary/50 bg-white/[0.035] px-[18px] text-[14px] font-medium text-text-secondary hover:bg-white/[0.08] hover:text-text-primary disabled:opacity-50"}>
      {trigger || <><Edit2Line size={17} />{t("settings.profile.change_avatar")}</>}
    </button>
    {source && <ImageCropDialog key={source.url} source={source} kind="avatar" onClose={() => setSource(null)} onSave={uploadAvatar} />}
    {error && <p role="alert" className="mb-0 mt-[16px] text-center text-[13px] text-red-400">{error}</p>}
  </div>;
}
