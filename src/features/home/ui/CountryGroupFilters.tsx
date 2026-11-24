import { useId } from "react";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { DownLine } from "@mingcute/react";
import { useTranslation } from "@/languages";
import { COUNTRY_GROUPS, type CountryGroup } from "../vibe/vibeLanguages";

interface CountryGroupProps {
  value: CountryGroup;
  onChange: (group: CountryGroup) => void;
}

export function CountryGroupSelect({ value, onChange }: CountryGroupProps) {
  const { t } = useTranslation();
  return (
    <div className="relative min-w-0">
      <select
        aria-label={t("home.country_regions")}
        value={value}
        onChange={event => onChange(event.currentTarget.value as CountryGroup)}
        className="block w-full cursor-pointer appearance-none truncate rounded-lg border-0 bg-bg-elevated py-2 pl-3 pr-7 text-[13px] font-semibold text-text-primary"
      >
        {COUNTRY_GROUPS.map(group => (
          <option key={group} value={group}>{t(`home.country_group.${group}`)}</option>
        ))}
      </select>
      <DownLine aria-hidden size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary" />
    </div>
  );
}

export default function CountryGroupFilters({ value, onChange }: CountryGroupProps) {
  const { t } = useTranslation();
  const layoutId = useId();
  const reducedMotion = useReducedMotion();
  return (
    <LayoutGroup id={layoutId}>
      <motion.div layoutScroll role="group" aria-label={t("home.country_regions")}
        className="no-scrollbar relative isolate flex shrink-0 gap-2 overflow-x-auto py-1">
        {COUNTRY_GROUPS.map(group => (
          <button key={group} type="button" aria-pressed={value === group} onClick={() => onChange(group)}
            className={`relative shrink-0 cursor-pointer whitespace-nowrap rounded-lg border-0 bg-bg-elevated px-3 py-1.5 text-[12px] font-semibold ${
              value === group ? "text-btn-primary-text" : "text-text-secondary hover:text-text-primary"
            }`}>
            {value === group && (
              <motion.span aria-hidden layoutId="active-continent" initial={false}
                className="pointer-events-none absolute inset-0 z-10 rounded-lg bg-btn-primary-bg"
                transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 34 }} />
            )}
            <span className="relative z-20">{t(`home.country_group.${group}`)}</span>
          </button>
        ))}
      </motion.div>
    </LayoutGroup>
  );
}
