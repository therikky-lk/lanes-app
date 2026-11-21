import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/languages";
import { onAndroidBack } from "@/shared/platform/androidBack";
import Dialog from "@/shared/ui/Dialog";
import Button from "@/shared/ui/Button";
import {
  clampCrop, cropScale, gestureCrop, MAX_CROP_ZOOM, minimumZoom, renderCrop,
  type CropSource, type CropTransform, type Point,
} from "./imageCrop";
import "./imageCrop.css";

type Props = {
  source: CropSource;
  kind: "avatar" | "banner";
  onClose: () => void;
  onSave: (dataUrl: string) => Promise<void>;
};

export default function ImageCropDialog(props: Props) {
  const [saving, setSaving] = useState(false);
  const close = () => { if (!saving) props.onClose(); };
  useEffect(() => onAndroidBack(() => { close(); return true; }), [saving, props.onClose]);
  return <Dialog open onOpenChange={open => { if (!open) close(); }} maxWidth={props.kind === "banner" ? 640 : 400} zIndex={230} className="lane-image-crop-dialog">
    <CropEditor {...props} saving={saving} setSaving={setSaving} />
  </Dialog>;
}

function CropEditor({ source, kind, onClose, onSave, saving, setSaving }: Props & { saving: boolean; setSaving: (value: boolean) => void }) {
  const { t } = useTranslation();
  const view = kind === "banner" ? { width: 480, height: 160 } : { width: 224, height: 224 };
  const dimensions = { width: source.image.naturalWidth, height: source.image.naturalHeight };
  const minZoom = minimumZoom(dimensions, view);
  const [transform, setTransform] = useState<CropTransform>({ zoom: 1, offset: { x: 0, y: 0 } });
  const current = useRef(transform);
  const area = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ transform: CropTransform; center: Point; distance: number } | null>(null);
  const [error, setError] = useState("");
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  const update = (next: CropTransform) => {
    current.current = next;
    setTransform(next);
  };
  const localPoint = (x: number, y: number): Point => {
    const rect = area.current!.getBoundingClientRect();
    const scale = view.width / rect.width;
    return { x: (x - rect.left - rect.width / 2) * scale, y: (y - rect.top - rect.height / 2) * scale };
  };
  const pointerGeometry = () => {
    const points = [...pointers.current.values()];
    if (!points.length) return null;
    return points.length === 1 ? { center: points[0], distance: 0 } : {
      center: { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 },
      distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
    };
  };
  const rebase = () => {
    const geometry = pointerGeometry();
    gesture.current = geometry ? { ...geometry, transform: current.current } : null;
  };
  const endPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    rebase();
  };

  // Native non-passive listener prevents the page scrolling while zooming the crop.
  useEffect(() => {
    const element = area.current;
    if (!element || saving) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const point = localPoint(event.clientX, event.clientY);
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 160 : 1);
      update(gestureCrop(dimensions, view, current.current, point, point, Math.exp(-delta * 0.002)));
      rebase();
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [source, kind, saving]);

  const save = async () => {
    if (saving) return;
    setSaving(true); setError("");
    try {
      const output = kind === "banner"
        ? (source.file.type === "image/gif" ? { width: 600, height: 200 } : { width: 1200, height: 400 })
        : { width: 256, height: 256 };
      const dataUrl = await renderCrop(source, view, current.current, output);
      if (!active.current) return;
      if (kind === "banner" && dataUrl.length > 700000) {
        setError(`${t("settings.profile.upload_banner_hint")} (≤ 500 KB)`);
        return;
      }
      await onSave(dataUrl);
      if (active.current) onClose();
    } catch { if (active.current) setError(t("settings.profile.save_failed")); }
    finally { if (active.current) setSaving(false); }
  };

  const scale = cropScale(dimensions, view) * transform.zoom;
  const progress = (transform.zoom - minZoom) / (MAX_CROP_ZOOM - minZoom) * 100;
  return <>
    <h3 className="lane-image-crop-title">{t(kind === "banner" ? "settings.profile.banner" : "settings.profile.avatar")}</h3>
    <div className={`lane-image-crop-workspace is-${kind}`}>
      <div
        ref={area}
        className={`lane-image-crop-area is-${kind}`}
        aria-label={t("settings.profile.crop_hint")}
        aria-disabled={saving}
        onPointerDown={event => {
          if (saving || (event.pointerType === "mouse" && event.button !== 0)) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          pointers.current.set(event.pointerId, localPoint(event.clientX, event.clientY));
          rebase();
        }}
        onPointerMove={event => {
          if (saving || !pointers.current.has(event.pointerId) || !gesture.current) return;
          pointers.current.set(event.pointerId, localPoint(event.clientX, event.clientY));
          const geometry = pointerGeometry()!;
          const start = gesture.current;
          const ratio = start.distance > 0 && geometry.distance > 0 ? geometry.distance / start.distance : 1;
          update(gestureCrop(dimensions, view, start.transform, start.center, geometry.center, ratio));
        }}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onLostPointerCapture={endPointer}
      >
        <img src={source.url} alt="" draggable={false} style={{
          width: `${dimensions.width * scale / view.width * 100}%`,
          height: `${dimensions.height * scale / view.height * 100}%`,
          transform: `translate(-50%, -50%) translate(${transform.offset.x / view.width * 100}cqw, ${transform.offset.y / view.width * 100}cqw)`,
        }} />
        <span className="lane-image-crop-grid" aria-hidden="true" />
      </div>
      <label className="lane-image-crop-zoom" title={t("settings.profile.crop_zoom")}>
        <input type="range" aria-label={t("settings.profile.crop_zoom")} min={minZoom} max={MAX_CROP_ZOOM} step="0.001" value={transform.zoom} disabled={saving}
          style={{ background: `linear-gradient(to top, var(--text-primary) 0%, var(--text-primary) ${progress}%, #7778 ${progress}%, #7778 100%)` }}
          onChange={event => {
            update(clampCrop(dimensions, view, { ...current.current, zoom: Number(event.target.value) }));
            rebase();
          }} />
      </label>
    </div>
    <p className="lane-image-crop-hint">{t("settings.profile.crop_hint")}</p>
    {error && <p role="alert" className="lane-image-crop-error">{error}</p>}
    <div className="lane-image-crop-actions">
      <Button type="button" variant="secondary" disabled={saving} onClick={onClose}>{t("common.cancel")}</Button>
      <Button type="button" variant="primary" disabled={saving} onClick={() => void save()}>{t(saving ? "settings.profile.saving" : kind === "avatar" ? "settings.profile.save_crop" : "settings.profile.save")}</Button>
    </div>
  </>;
}
