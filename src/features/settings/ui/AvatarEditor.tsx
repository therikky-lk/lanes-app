import { useEffect, useRef, useState } from "react";
import { Edit2Line } from "@mingcute/react";
import { useAuthStore } from "@/features/auth";
import { useLocalAvatarStore } from "@/features/auth/store/localAvatarStore";
import { useTranslation } from "@/languages";
import { getAccessToken, getAuthSession } from "@/shared/api";
import { getApiBaseUrlForAuthBackend, LANE_LINK_ORIGIN } from "@/shared/api/baseUrl";
import Button from "@/shared/ui/Button";

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

export default function AvatarEditor() {
  const { t } = useTranslation();
  const user = useAuthStore(state => state.user);
  const removeLocalAvatar = useLocalAvatarStore(state => state.removeAvatar);
  const fileInput = useRef<HTMLInputElement>(null);
  const cropArea = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; origin: Point; offset: Point } | null>(null);
  const [cropImage, setCropImage] = useState<CropImage | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => { if (cropImage?.url) URL.revokeObjectURL(cropImage.url); }, [cropImage]);

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
      const session = getAuthSession();
      const isHyprrAccount = session?.authBackend === "hyprr";
      const apiBaseUrl = getApiBaseUrlForAuthBackend(session?.authBackend);
      const response = await fetch(`${isHyprrAccount ? apiBaseUrl : LANE_LINK_ORIGIN}/v1/me/avatar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      if (!response.ok) throw new Error("avatar upload failed");
      const uploaded = await response.json() as { avatarUrl?: string };
      if (!uploaded.avatarUrl) throw new Error("invalid avatar response");
      const freshAvatarUrl = uploaded.avatarUrl.startsWith("data:")
        ? uploaded.avatarUrl
        : (() => {
          const url = new URL(uploaded.avatarUrl!, apiBaseUrl);
          url.searchParams.set("v", String(Date.now()));
          return url.toString();
        })();
      // Store the returned CDN URL on the profile too; relying on the upload
      // response only updated this device's cached auth session.
      await useAuthStore.getState().updateProfile({ avatarUrl: freshAvatarUrl });
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

  return <div className="flex flex-col items-start">
          <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void chooseImage(file); }} />
          {!cropImage ? (
            <button type="button" disabled={busy || !user} onClick={() => fileInput.current?.click()} className="mt-[20px] inline-flex h-[44px] items-center gap-[8px] rounded-full border border-border-primary/50 bg-white/[0.035] px-[18px] text-[14px] font-medium text-text-secondary hover:bg-white/[0.08] hover:text-text-primary disabled:opacity-50">
              <Edit2Line size={17} />{t("settings.profile.change_avatar")}
            </button>
          ) : (
            <div className="mt-[20px] w-full max-w-[360px]">
              <div
                ref={cropArea}
                className="relative touch-none mx-auto h-[192px] w-[192px] overflow-hidden rounded-full bg-black"
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
                <Button type="button" variant="secondary" disabled={busy} className="!h-[42px] !flex-1 !rounded-[12px]" onClick={() => setCropImage(null)}>{t("common.cancel")}</Button>
                <Button type="button" variant="primary" disabled={busy} className="!h-[42px] !flex-1 !rounded-[12px]" onClick={() => void uploadAvatar()}>{busy ? t("settings.profile.saving") : t("settings.profile.save_crop")}</Button>
              </div>
            </div>
          )}
          {error && <p role="alert" className="mb-0 mt-[16px] text-center text-[13px] text-red-400">{error}</p>}

  </div>;
}
