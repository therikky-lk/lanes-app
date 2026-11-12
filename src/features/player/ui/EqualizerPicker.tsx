import { useId, useState } from "react";
import { AddLine, CloseLine, Refresh1Line } from "@mingcute/react";
import { ToggleSwitch } from "@/shared/ui";
import { useTranslation } from "@/languages";
import { usePlayerStore } from "../store/playerStore";
import { playerEngine } from "../engine/playerEngine";
import { EQ_BANDS, EQ_PRESETS, EQ_MAX_CUSTOM_PRESETS, EQ_PRESET_NAME_MAX, FLAT_EQ, formatEqFrequency, type EqPresetCategory } from "../engine/equalizer";

const dbLabel = (value: number) => `${value > 0 ? "+" : ""}${value}`;
export function EqualizerPicker({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  const enabled = usePlayerStore(state => state.isEqEnabled);
  const gains = usePlayerStore(state => state.eqGains);
  const custom = usePlayerStore(state => state.eqCustomPresets);
  const [tab, setTab] = useState<EqPresetCategory | "custom">("enhance");
  const [name, setName] = useState("");
  const [naming, setNaming] = useState(false);
  const id = useId();
  const apply = (values: number[]) => { playerEngine.setEqGains(values); playerEngine.setIsEqEnabled(true); };
  const active = (values: number[]) => enabled && values.every((value, index) => value === gains[index]);
  const presets = tab === "custom" ? custom : EQ_PRESETS.filter(preset => preset.category === tab);
  return <div className={`flex flex-col gap-4 text-text-primary select-none ${className}`} onClick={event => event.stopPropagation()}>
    <div className="flex items-start justify-between gap-3">
      <div><h3 className="m-0 text-[13px] font-semibold">{t("player.equalizer")}</h3>
        <p className="m-0 mt-1 text-[11px] text-text-tertiary">{t("player.equalizer_hint")}</p></div>
      <ToggleSwitch checked={enabled} onChange={value => playerEngine.setIsEqEnabled(value)} ariaLabel={t("player.equalizer")} />
    </div>
    <div className="flex gap-1 overflow-x-auto rounded-[9px] bg-black/5 dark:bg-white/5 p-1" role="tablist" aria-label={t("player.equalizer")}>
      {(["enhance", "genre", "accent", "custom"] as const).map(category => <button key={category} type="button" role="tab"
        id={`${id}-${category}`} aria-controls={`${id}-presets`} aria-selected={tab === category}
        onClick={() => setTab(category)} className={`flex-1 whitespace-nowrap rounded-[6px] border-0 px-1.5 py-1.5 text-[11px] transition-colors ${tab === category ? "bg-black/10 dark:bg-white/10 text-text-primary" : "bg-transparent text-text-tertiary"}`}>
        {t(`player.eq_tab_${category}`)}</button>)}
    </div>
    <div id={`${id}-presets`} role="tabpanel" aria-labelledby={`${id}-${tab}`} className="grid grid-cols-3 gap-1">
      {presets.map(preset => <div key={preset.id} className="relative group min-w-0">
        <button type="button" aria-pressed={active(preset.gains)} onClick={() => apply(preset.gains)}
          className={`h-[27px] w-full truncate rounded-[7px] border-0 px-2 text-[11px] ${active(preset.gains) ? "bg-text-primary text-bg-primary" : "bg-black/5 dark:bg-white/[0.07] text-text-secondary hover:bg-black/10 dark:hover:bg-white/10"}`}>
          {"name" in preset ? preset.name : t(`player.eq_preset_${preset.id}`)}</button>
        {tab === "custom" && <button type="button" aria-label={t("player.eq_delete_preset")} onClick={() => playerEngine.deleteEqPreset(preset.id)}
          className="absolute -right-1 -top-1 h-4 w-4 rounded-full border-0 bg-text-primary text-bg-primary opacity-0 group-hover:opacity-100 focus:opacity-100"><CloseLine size={12} /></button>}
      </div>)}
      {tab === "custom" && <div className="col-span-3">
        {naming ? <form className="flex gap-2" onSubmit={event => { event.preventDefault(); if (name.trim()) { playerEngine.saveEqPreset(name); setName(""); setNaming(false); } }}>
          <input autoFocus aria-label={t("player.eq_preset_name")} placeholder={t("player.eq_preset_name")} value={name} maxLength={EQ_PRESET_NAME_MAX}
            onChange={event => setName(event.target.value)} className="min-w-0 flex-1 rounded-md border-0 bg-black/5 dark:bg-white/10 px-2 text-[12px] text-text-primary" />
          <button type="submit" disabled={!name.trim()} className="rounded-md border-0 bg-text-primary px-2 py-1 text-[11px] text-bg-primary disabled:opacity-40">{t("player.eq_save_preset")}</button>
        </form> : <button type="button" disabled={custom.length >= EQ_MAX_CUSTOM_PRESETS} onClick={() => setNaming(true)}
          className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-border-primary bg-transparent py-2 text-[11px] text-text-secondary disabled:opacity-40"><AddLine size={12} />{t("player.eq_save_preset")}</button>}
      </div>}
    </div>
    <div className="grid grid-cols-10 gap-1" aria-label={t("player.eq_bands")}>
      {EQ_BANDS.map((frequency, index) => <label key={frequency} className={`flex min-w-0 flex-col items-center gap-2 ${enabled ? "" : "opacity-50"}`}>
        <span className="text-[10px] tabular-nums font-medium">{dbLabel(gains[index])}</span>
        <input type="range" min={-12} max={12} step={0.5} value={gains[index]} aria-label={`${frequency} Hz`} aria-valuetext={`${dbLabel(gains[index])} dB`}
          onChange={event => { const values = [...gains]; values[index] = Number(event.target.value); apply(values); }}
          onDoubleClick={() => { const values = [...gains]; values[index] = 0; apply(values); }}
          className="lane-eq-band" style={{ writingMode: "vertical-lr", direction: "rtl", height: 112, width: 18, margin: 0 }} />
        <span className="text-[10px] text-text-tertiary">{formatEqFrequency(frequency)}</span>
      </label>)}
    </div>
    <button type="button" onClick={() => playerEngine.setEqGains(FLAT_EQ)} className="flex items-center justify-center gap-1 self-end border-0 bg-transparent text-[11px] text-text-tertiary hover:text-text-primary"><Refresh1Line size={12} />{t("player.eq_reset")}</button>
  </div>;
}
