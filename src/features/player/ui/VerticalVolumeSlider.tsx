import { VolumeCross, VolumeLoud, VolumeSmall } from "@solar-icons/react";
import { useTranslation } from "@/languages";
import { playerEngine } from "../engine/playerEngine";
import { toVolumeGain, toVolumeLevel } from "../engine/volume";
import { usePlayerStore } from "../store/playerStore";

export function VolumeLevelIcon({ level, size }: { level: number; size: number }) {
  const Icon = level === 0 ? VolumeCross : level < 0.5 ? VolumeSmall : VolumeLoud;
  return <Icon size={size} weight="Bold" />;
}

export function VerticalVolumeSlider() {
  const { t } = useTranslation();
  const level = usePlayerStore(s => toVolumeLevel(s.volume));
  const percent = Math.round(level * 100);

  return (
    <div className="group relative h-32 w-[46px] rounded-xl bg-black/30 p-1 backdrop-blur-md">
      <div aria-hidden="true" className="pointer-events-none relative h-full overflow-hidden rounded-lg">
        <div className="absolute inset-x-0 bottom-0 bg-[#e4dfdd]" style={{ height: `${percent}%` }} />
        <div className={`absolute inset-x-0 top-2 flex justify-center ${percent >= 88 ? "text-[#231b18]" : "text-white drop-shadow-sm"}`}>
          <VolumeLevelIcon level={level} size={14} />
        </div>
        <div className={`absolute inset-x-0 bottom-1.5 text-center text-[11px] font-semibold tabular-nums group-has-[:focus-visible]:underline ${percent >= 18 ? "text-[#231b18]" : "text-white drop-shadow-sm"}`}>
          {percent}%
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={percent}
        aria-label={t("player.volume")}
        aria-valuetext={`${percent}%`}
        onChange={event => playerEngine.setVolume(toVolumeGain(event.currentTarget.valueAsNumber / 100))}
        className="absolute inset-1 m-0 h-[calc(100%-8px)] w-[calc(100%-8px)] cursor-ns-resize opacity-0"
        style={{ writingMode: "vertical-lr", direction: "rtl" }}
      />
    </div>
  );
}
