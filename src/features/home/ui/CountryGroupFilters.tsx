import { useId } from "react";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { useTranslation } from "@/languages";
import Select from "@/shared/ui/Select";
import { COUNTRY_GROUPS, type CountryGroup } from "../vibe/vibeLanguages";

interface CountryGroupProps {
  value: CountryGroup;
  onChange: (group: CountryGroup) => void;
}

export function CountryGroupSelect({ value, onChange }: CountryGroupProps) {
  const { t } = useTranslation();
  return (
    <Select
      options={COUNTRY_GROUPS.map(group => ({ value: group, label: t(`home.country_group.${group}`) }))}
      value={value}
      onChange={onChange}
      align="bottom-right"
      aria-label={t("home.country_regions")}
      className="max-w-full"
    />
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
