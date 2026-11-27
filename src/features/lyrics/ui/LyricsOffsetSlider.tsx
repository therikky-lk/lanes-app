import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "@/languages";

const STEP_MS = 50;
const LIMIT_MS = 2_000;

export function LyricsOffsetSlider({ value, onChange }: {
  value: number;
  onChange: (value: number) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<number | null>(null);
  const drag = useRef<{ pointerId: number; value: number } | null>(null);
  const displayValue = draft ?? value;
  const clamped = Math.max(-LIMIT_MS, Math.min(LIMIT_MS, displayValue));
  const position = `${(clamped + LIMIT_MS) / (2 * LIMIT_MS) * 100}%`;
  const valueText = `${displayValue > 0 ? "+" : ""}${displayValue} ms`;
  const stepBy = (step: number) => onChange(Math.max(-LIMIT_MS, Math.min(LIMIT_MS, clamped + step)));

  useEffect(() => {
    const finish = (event: PointerEvent) => {
      const pending = drag.current;
      if (!pending || pending.pointerId !== event.pointerId) return;
      drag.current = null;
      setDraft(null);
      onChange(pending.value);
    };
    // Release may land outside the input. Native keyboard edits still commit immediately.
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [onChange]);

  return (
    <div className="mt-1 border-t border-white/15 px-1.5 pb-1 pt-2" role="group" aria-label={t("player.lyrics_offset")}>
      <div className="text-[12px] font-medium text-white/85">{t("player.lyrics_offset")}</div>
      <div className="lane-lyrics-offset-slider" style={{ "--lane-offset-position": position } as CSSProperties}>
        <input type="range" min={-LIMIT_MS} max={LIMIT_MS} step={STEP_MS} value={clamped}
          aria-label={t("player.lyrics_offset")} aria-valuetext={valueText}
          onPointerDown={event => {
            if (event.button === 0 && !drag.current) drag.current = { pointerId: event.pointerId, value: clamped };
          }}
          onChange={event => {
            const offset = event.currentTarget.valueAsNumber;
            if (drag.current) {
              drag.current.value = offset;
              setDraft(offset);
            } else {
              onChange(offset);
            }
          }} />
        <div className="lane-lyrics-offset-track" aria-hidden="true">
          <span className="lane-lyrics-offset-pointer" />
          <span className="lane-lyrics-offset-mark" />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <button type="button" className="lane-lyrics-offset-button" aria-label={t("player.earlier")}
          title={t("player.earlier")} disabled={clamped <= -LIMIT_MS}
          onClick={event => stepBy(event.shiftKey ? -STEP_MS * 2 : -STEP_MS)}>−</button>
        <button type="button" className="lane-lyrics-offset-value" aria-label={`${t("player.reset")}: ${valueText}`}
          title={t("player.reset")} onClick={() => onChange(0)}>{valueText}</button>
        <button type="button" className="lane-lyrics-offset-button" aria-label={t("player.later")}
          title={t("player.later")} disabled={clamped >= LIMIT_MS}
          onClick={event => stepBy(event.shiftKey ? STEP_MS * 2 : STEP_MS)}>+</button>
      </div>
    </div>
  );
}
