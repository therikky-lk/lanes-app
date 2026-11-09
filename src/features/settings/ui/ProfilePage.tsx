import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeftLine, Edit2Line, ExitLine } from "@mingcute/react";
import { useAuthStore } from "@/features/auth";
import { useLocalAvatarStore } from "@/features/auth/store/localAvatarStore";
import { useTranslation } from "@/languages";
import { getAccessToken } from "@/shared/api";
import { LANE_LINK_ORIGIN } from "@/shared/api/baseUrl";
import { onAndroidBack } from "@/shared/platform/androidBack";
import { useIsMobile } from "@/shared/hooks/useIsMobile";
import Button from "@/shared/ui/Button";
import UserAvatar from "@/shared/ui/UserAvatar";

type CropImage = { url: string; image: HTMLImageElement };
type Point = { x: number; y: number };
const CROP_SIZE = 192;

async function loadImage(file: File): Promise<CropImage> {
  if (!file.type.startsWith("image/") || file.size > 20 * 1024 * 1024) throw new Error("invalid image");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { url, image };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function makeCroppedAvatar(source: CropImage, zoom: number, offset: Point): string {
  const { image } = source;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");

  const minSide = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceSide = minSide / zoom;
  const baseScale = CROP_SIZE / minSide;
  const sourceCenterX = image.naturalWidth / 2 - offset.x / (baseScale * zoom);
  const sourceCenterY = image.naturalHeight / 2 - offset.y / (baseScale * zoom);
  const sx = Math.max(0, Math.min(image.naturalWidth - sourceSide, sourceCenterX - sourceSide / 2));
  const sy = Math.max(0, Math.min(image.naturalHeight - sourceSide, sourceCenterY - sourceSide / 2));
  ctx.drawImage(image, sx, sy, sourceSide, sourceSide, 0, 0, 256, 256);
  return canvas.toDataURL("image/jpeg", 0.88);
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { t } = useTranslation();
  const user = useAuthStore(state => state.user);
  const removeLocalAvatar = useLocalAvatarStore(state => state.removeAvatar);
  const logout = useAuthStore(state => state.logout);
  const fileInput = useRef<HTMLInputElement>(null);
  const cropArea = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; origin: Point; offset: Point } | null>(null);
  const [cropImage, setCropImage] = useState<CropImage | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isRussian = typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("ru");
  const displayName = user?.displayName || user?.username || user?.email?.split("@")[0] || "Lane";

  useEffect(() => () => { if (cropImage?.url) URL.revokeObjectURL(cropImage.url); }, [cropImage]);
  useEffect(() => onAndroidBack(() => { navigate(-1); return true; }), [navigate]);

  const maxOffset = (nextZoom: number, dimension: "x" | "y") => {
    if (!cropImage) return 0;
    const minSide = Math.min(cropImage.image.naturalWidth, cropImage.image.naturalHeight);
    const imageSide = dimension === "x" ? cropImage.image.naturalWidth : cropImage.image.naturalHeight;
    return Math.max(0, (CROP_SIZE * imageSide / minSide * nextZoom - CROP_SIZE) / 2);
  };

  const chooseImage = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const next = await loadImage(file);
      setCropImage(previous => {
        if (previous) URL.revokeObjectURL(previous.url);
        return next;
      });
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    } catch {
      setError(t("settings.profile.avatar_invalid"));
    } finally {
      setBusy(false);
    }
  };

  const uploadAvatar = async () => {
    if (!user || !cropImage || busy) return;
    setBusy(true);
    setError("");
    try {
      const accessToken = getAccessToken();
      if (!accessToken) throw new Error("unauthorized");
      const dataUrl = makeCroppedAvatar(cropImage, zoom, offset);
      const response = await fetch(`${LANE_LINK_ORIGIN}/v1/me/avatar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      if (!response.ok) throw new Error("avatar upload failed");
      const uploaded = await response.json() as { avatarUrl?: string };
      if (!uploaded.avatarUrl) throw new Error("invalid avatar response");
      const freshAvatarUrl = new URL(uploaded.avatarUrl, LANE_LINK_ORIGIN);
      freshAvatarUrl.searchParams.set("v", String(Date.now()));
      // Store the returned CDN URL on the profile too; relying on the upload
      // response only updated this device's cached auth session.
      await useAuthStore.getState().updateProfile({ avatarUrl: freshAvatarUrl.toString() });
      removeLocalAvatar(user.id);
      setCropImage(null);
    } catch {
      setError(t("settings.profile.save_failed"));
    } finally {
      setBusy(false);
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!cropImage) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, origin: { x: event.clientX, y: event.clientY }, offset };
  };
  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId || !cropArea.current) return;
    const scale = cropArea.current.clientWidth / CROP_SIZE;
    const next = {
      x: drag.current.offset.x + (event.clientX - drag.current.origin.x) / scale,
      y: drag.current.offset.y + (event.clientY - drag.current.origin.y) / scale,
    };
    setOffset({
      x: Math.max(-maxOffset(zoom, "x"), Math.min(maxOffset(zoom, "x"), next.x)),
      y: Math.max(-maxOffset(zoom, "y"), Math.min(maxOffset(zoom, "y"), next.y)),
    });
  };

  return (
    <section className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-bg-primary" style={{ paddingTop: "var(--lane-safe-top, 0px)", paddingBottom: "var(--lane-dock-h, 58px)" }}>
      <header className="flex h-[56px] shrink-0 items-center gap-[12px] border-b border-border-primary/50 px-[16px] md:px-[32px]">
        <button type="button" aria-label={t("common.back")} onClick={() => navigate(-1)} className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full border-0 bg-white/[0.05] text-text-secondary hover:bg-white/[0.1] hover:text-text-primary">
          <ArrowLeftLine size={19} />
        </button>
        <h1 className="m-0 text-[18px] font-[650] text-text-primary">{t("settings.profile.title")}</h1>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto px-[16px] py-[24px] md:px-[32px]" style={{ paddingBottom: isMobile ? "calc(var(--lane-dock-h, 120px) + 24px)" : undefined }}>
        <div className="mx-auto flex w-full max-w-[440px] flex-col items-center rounded-[16px] border border-border-primary/40 bg-bg-panel/45 px-[18px] py-[20px] sm:px-[24px]">
          <div className="relative mb-[18px] h-[120px] w-[120px] overflow-hidden rounded-full bg-bg-elevated">
            {cropImage ? (
              <img
                src={cropImage.url}
                alt={isRussian ? "Предпросмотр аватара" : "Avatar preview"}
                draggable={false}
                className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
                style={{
                  width: `${(cropImage.image.naturalWidth / Math.min(cropImage.image.naturalWidth, cropImage.image.naturalHeight)) * 100}%`,
                  height: `${(cropImage.image.naturalHeight / Math.min(cropImage.image.naturalWidth, cropImage.image.naturalHeight)) * 100}%`,
                  transform: `translate(calc(-50% + ${offset.x * 120 / CROP_SIZE}px), calc(-50% + ${offset.y * 120 / CROP_SIZE}px)) scale(${zoom})`,
                }}
              />
            ) : <UserAvatar key={user?.avatarUrl} user={user} size={120} className="!h-full !w-full !rounded-full !border-0" />}
          </div>
          <strong className="max-w-full truncate text-[22px] font-[650] tracking-[-0.02em] text-text-primary">{displayName}</strong>
          <span className="mt-[4px] max-w-full truncate text-[14px] text-text-tertiary">{user?.username ? `@${user.username}` : user?.email}</span>

          <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void chooseImage(file); }} />
          {!cropImage ? (
            <button type="button" disabled={busy || !user} onClick={() => fileInput.current?.click()} className="mt-[20px] inline-flex h-[44px] items-center gap-[8px] rounded-full border border-border-primary/50 bg-white/[0.035] px-[18px] text-[14px] font-medium text-text-secondary hover:bg-white/[0.08] hover:text-text-primary disabled:opacity-50">
              <Edit2Line size={17} />{t("settings.profile.change_avatar")}
            </button>
          ) : (
            <div className="mt-[20px] w-full max-w-[360px]">
              <div
                ref={cropArea}
                className="relative mx-auto h-[192px] w-[192px] overflow-hidden rounded-full bg-black"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={() => { drag.current = null; }}
                onPointerCancel={() => { drag.current = null; }}
              >
                <img
                  src={cropImage.url}
                  alt=""
                  draggable={false}
                  className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
                  style={{
                    width: `${(cropImage.image.naturalWidth / Math.min(cropImage.image.naturalWidth, cropImage.image.naturalHeight)) * 100}%`,
                    height: `${(cropImage.image.naturalHeight / Math.min(cropImage.image.naturalWidth, cropImage.image.naturalHeight)) * 100}%`,
                    transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${zoom})`,
                  }}
                />
              </div>
              <label className="mt-[18px] flex items-center gap-[12px] text-[13px] text-text-secondary">
                <span className="shrink-0">{t("settings.profile.crop_zoom")}</span>
                <input aria-label={t("settings.profile.crop_zoom")} type="range" min="1" max="3" step="0.01" value={zoom} onChange={event => {
                  const nextZoom = Number(event.target.value);
                  setZoom(nextZoom);
                  setOffset(current => ({
                    x: Math.max(-maxOffset(nextZoom, "x"), Math.min(maxOffset(nextZoom, "x"), current.x)),
                    y: Math.max(-maxOffset(nextZoom, "y"), Math.min(maxOffset(nextZoom, "y"), current.y)),
                  }));
                }} className="min-w-0 flex-1 accent-white" />
              </label>
              <p className="mb-0 mt-[8px] text-center text-[12px] text-text-tertiary">{t("settings.profile.crop_hint")}</p>
              <div className="mt-[16px] flex gap-[10px]">
                <Button variant="secondary" disabled={busy} className="!h-[42px] !flex-1 !rounded-[12px]" onClick={() => setCropImage(null)}>{t("common.cancel")}</Button>
                <Button variant="primary" disabled={busy} className="!h-[42px] !flex-1 !rounded-[12px]" onClick={() => void uploadAvatar()}>{busy ? t("settings.profile.saving") : t("settings.profile.save_crop")}</Button>
              </div>
            </div>
          )}
          {error && <p role="alert" className="mb-0 mt-[16px] text-center text-[13px] text-red-400">{error}</p>}
          {!cropImage && user && <Button variant="secondary" disabled={busy} className="mt-[40px] !h-[48px] !w-full !rounded-[13px]" onClick={async () => {
            setBusy(true);
            try { await logout(); navigate("/", { replace: true }); }
            catch { setError(t("settings.profile.save_failed")); }
            finally { setBusy(false); }
          }}><ExitLine size={18} />{t("settings.profile.sign_out")}</Button>}
        </div>
      </main>
    </section>
  );
}
