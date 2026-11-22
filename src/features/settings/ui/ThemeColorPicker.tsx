import { useCallback, useEffect, useId, useState, type CSSProperties } from "react";
import { useTranslation } from "@/languages";
import { onAndroidBack } from "@/shared/platform/androidBack";
import Button from "@/shared/ui/Button";
import Dialog from "@/shared/ui/Dialog";
import { DEFAULT_CUSTOM_COLOR } from "@/shared/theme/themePreferences";
import { hexToThemeHSV, parseThemeHex, themeHSVToHex, type ThemeHSV } from "./themeColor";
import "./themeColorPicker.css";

const SUGGESTIONS = [DEFAULT_CUSTOM_COLOR, "#567da4", "#5d9c8e", "#85a278", "#bc9b6d", "#b77986", "#8b8b97"];

export default function ThemeColorPicker({ color, onClose, onSave }: {
  color: string;
  onClose: () => void;
  onSave: (color: string) => void;
}) {
  const { t } = useTranslation();
  const title = useId();
  const [hsv, setHSV] = useState(() => hexToThemeHSV(color));
  const [draft, setDraft] = useState(color.toUpperCase());
  const handleOpenChange = useCallback((open: boolean) => { if (!open) onClose(); }, [onClose]);
  useEffect(() => onAndroidBack(() => { onClose(); return true; }), [onClose]);

  const selected = parseThemeHex(draft);
  const preview = selected ?? themeHSVToHex(hsv);
  const updateDraft = (text: string) => {
    setDraft(text);
    const hex = parseThemeHex(text);
    if (hex) setHSV(hexToThemeHSV(hex));
  };
  const updateSlider = (channel: keyof ThemeHSV, value: number) => {
    const next = { ...hsv, [channel]: value };
    setHSV(next);
    setDraft(themeHSVToHex(next).toUpperCase());
  };
  const sliders = [
    { key: "h", name: t("settings.theme.hue"), max: 360, track: "linear-gradient(90deg, #e74b54, #edc34c, #64cf62, #46cacf, #6179ed, #bc61df, #e74b54)" },
    { key: "s", name: t("settings.theme.saturation"), max: 100, track: `linear-gradient(90deg, ${themeHSVToHex({ ...hsv, s: 0 })}, ${themeHSVToHex({ ...hsv, s: 100 })})` },
    { key: "v", name: t("settings.theme.brightness"), max: 100, track: `linear-gradient(90deg, #000, ${themeHSVToHex({ ...hsv, v: 100 })})` },
  ] as const;

  return (
    <Dialog open onOpenChange={handleOpenChange} maxWidth={410} zIndex={240} aria-labelledby={title} className="shadow-2xl">
      <form className="flex min-h-0 flex-col gap-5 overflow-y-auto p-5" onSubmit={(event) => {
        event.preventDefault();
        if (selected) onSave(selected);
      }}>
        <div>
          <h2 id={title} className="m-0 text-xl font-semibold text-text-primary">{t("settings.theme.custom_color")}</h2>
          <p className="m-0 mt-1 text-sm text-text-tertiary">{t("settings.theme.custom_color_description")}</p>
        </div>
        <div className="lane-theme-preview flex h-[78px] items-center gap-3 rounded-2xl border border-border-secondary bg-bg-canvas p-3"
          style={{ "--lane-custom-seed": preview } as CSSProperties} aria-hidden="true">
          <span className="size-9 shrink-0 rounded-xl bg-accent-primary" />
          <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-xl bg-bg-panel p-3">
            <span className="h-1.5 w-16 max-w-full rounded-full bg-text-primary" />
            <span className="h-1.5 w-10 max-w-full rounded-full bg-text-tertiary" />
          </div>
          <span className="h-7 w-11 rounded-lg bg-btn-primary-bg" />
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {SUGGESTIONS.map((suggestion) => (
            <button key={suggestion} type="button" aria-label={suggestion.toUpperCase()} aria-pressed={selected === suggestion}
              onClick={() => updateDraft(suggestion.toUpperCase())}
              className="grid h-8 cursor-pointer place-items-center rounded-lg border border-border-secondary bg-bg-elevated aria-pressed:border-accent-primary focus-visible:outline-2 focus-visible:outline-accent-primary">
              <span className="size-4 rounded-full" style={{ backgroundColor: suggestion }} />
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          {sliders.map(({ key, name, max, track }) => (
            <label key={key} className="grid grid-cols-[1fr_auto] gap-x-3 text-xs font-medium text-text-secondary">
              <span>{name}</span>
              <span aria-hidden="true" className="font-mono text-text-tertiary">{Math.round(hsv[key])}{key === "h" ? "°" : "%"}</span>
              <input className="lane-theme-slider col-span-2 w-full" type="range" min={0} max={max} value={hsv[key]}
                aria-label={name} style={{ "--slider-track": track } as CSSProperties}
                onChange={(event) => updateSlider(key, Number(event.currentTarget.value))} />
            </label>
          ))}
        </div>
        <label className="flex items-center gap-3 text-sm font-medium text-text-secondary">
          HEX
          <input value={draft} onChange={(event) => updateDraft(event.currentTarget.value)} maxLength={7}
            autoComplete="off" spellCheck={false} aria-invalid={!selected}
            className="w-full rounded-lg border border-border-secondary bg-bg-elevated px-3 py-2.5 font-mono text-text-primary outline-none focus:border-accent-primary" />
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
          <Button type="submit" disabled={!selected}>{t("settings.profile.save")}</Button>
        </div>
      </form>
    </Dialog>
  );
}
