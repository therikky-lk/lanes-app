import { useId, type ReactNode } from "react";
import { motion } from "framer-motion";
import { useIsContentTransparent } from "@/features/settings/store/customizationStore";

export interface SegmentedTabOption<T extends string> {
  id: T;
  label: ReactNode;
  /** small trailing counter */
  count?: number;
  title?: string;
}

export interface SegmentedTabsProps<T extends string> {
  options: SegmentedTabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** icon-only segments get square padding */
  iconOnly?: boolean;
  className?: string;
}

/** The app's tab switcher (same look as the Library tabs), reusable anywhere. */
export default function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  iconOnly = false,
  className = "",
}: SegmentedTabsProps<T>) {
  const hasCustomBg = useIsContentTransparent();
  const layoutId = useId();

  return (
    <div
      role="tablist"
      className={`inline-flex items-center gap-[4px] rounded-xl p-[4px] ${
        hasCustomBg ? "apple-glass-pill" : "bg-bg-elevated"
      } ${className}`}
    >
      {options.map((option) => {
        const isActive = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            title={option.title}
            aria-label={option.title}
            onClick={() => onChange(option.id)}
            className={`relative inline-flex items-center justify-center gap-[6px] rounded-lg ${
              iconOnly ? "px-[10px]" : "px-[16px]"
            } py-[7px] text-[13px] leading-none transition-colors duration-150 border-0 bg-transparent cursor-pointer select-none active:scale-[0.97] ${
              isActive
                ? hasCustomBg
                  ? "text-white dark:text-black font-semibold"
                  : "text-text-primary"
                : hasCustomBg
                  ? "text-black/70 dark:text-white/70 hover:text-black dark:hover:text-white"
                  : "text-text-secondary hover:text-text-primary"
            }`}
            style={{ fontFamily: "var(--font-inter), sans-serif", fontWeight: isActive ? 500 : 400 }}
          >
            {isActive && (
              <motion.div
                layoutId={`segmented-${layoutId}`}
                className={`absolute inset-0 rounded-lg ${hasCustomBg ? "apple-glass-prominent" : "bg-border-alpha-14"}`}
                transition={{ type: "spring", stiffness: 450, damping: 35 }}
              />
            )}
            <span className="relative z-10 inline-flex items-center">{option.label}</span>
            {option.count !== undefined && (
              <span className="relative z-10 text-[11px] text-text-tertiary tabular-nums">{option.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
