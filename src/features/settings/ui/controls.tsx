import { useId, type ReactNode } from "react";
import { motion } from "framer-motion";
import { getTranslationsForAllLocales } from "@/languages";

const rowSurface = "px-[16px]";

function matchesSearch({
  title,
  description,
  titleKey,
  descKey,
  searchQuery,
}: {
  title: string;
  description?: string;
  titleKey?: string;
  descKey?: string;
  searchQuery?: string;
}) {
  const query = searchQuery?.toLowerCase().trim();
  if (!query) return true;
  const texts = [title, description ?? ""];
  if (titleKey) texts.push(...getTranslationsForAllLocales(titleKey));
  if (descKey) texts.push(...getTranslationsForAllLocales(descKey));
  return texts.some((text) => text.toLowerCase().includes(query));
}

function RowText({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
      <span className="text-pretty text-text-primary text-[13.5px] font-[500] leading-[18px] tracking-[-0.005em]">
        {title}
      </span>
      {description ? (
        <span className="relative block max-w-[420px] text-pretty text-text-tertiary text-[12px] leading-[17px]">
          <motion.span
            key={description}
            className="block"
            initial={{ y: 12, opacity: 0, filter: "blur(3px)" }}
            animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            {description}
          </motion.span>
        </span>
      ) : null}
    </div>
  );
}

export function SettingRow({
  title,
  description,
  control,
  icon,
  titleKey,
  descKey,
  searchQuery,
  explained: _explained,
}: {
  title: string;
  description?: string;
  control?: ReactNode;
  icon?: ReactNode;
  titleKey?: string;
  descKey?: string;
  searchQuery?: string;
  explained?: boolean;
}) {
  if (!matchesSearch({ title, description, titleKey, descKey, searchQuery })) return null;

  return (
    <div className={`${rowSurface} lane-setting-row flex min-h-[52px] items-center justify-between gap-[14px] py-[10px]`}>
      {icon ? <span className="flex shrink-0 self-start pt-[1px] text-text-tertiary [&_svg]:h-[18px] [&_svg]:w-[18px]">{icon}</span> : null}
      <RowText title={title} description={description} />
      {control ? <div className="lane-setting-control shrink-0">{control}</div> : null}
    </div>
  );
}

// stacked block: label on top, wide control (cards, grids) below
export function SettingBlock({
  title,
  description,
  children,
  titleKey,
  descKey,
  searchQuery,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  titleKey?: string;
  descKey?: string;
  searchQuery?: string;
}) {
  if (!matchesSearch({ title, description, titleKey, descKey, searchQuery })) return null;

  return (
    <div className={`${rowSurface} lane-setting-block flex flex-col gap-[12px] py-[10px]`}>
      <RowText title={title} description={description} />
      {children}
    </div>
  );
}

export function SettingSection({
  label,
  action,
  children,
}: {
  label?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col [&:has(>[data-settings-card]>div:empty)]:hidden">
      {label ? (
        <div className="flex items-center justify-between gap-[12px] px-[2px] pb-[8px]">
          <h4 className="m-0 text-text-primary text-[14px] font-[600] leading-[20px] tracking-[-0.005em]">{label}</h4>
          {action ? <div className="mr-[4px] flex shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div data-settings-card className="rounded-[14px] bg-black/[0.05] py-[4px] dark:bg-white/[0.07]">
        <div className="flex flex-col">{children}</div>
      </div>
    </section>
  );
}

// compact pill switcher reused by language / playback / mini-player rows
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  disabled = false,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const groupId = useId();

  return (
    <div
      role={ariaLabel ? "group" : undefined}
      aria-label={ariaLabel}
      className={`inline-flex h-[34px] w-fit shrink-0 items-center rounded-[11px] bg-black/[0.05] p-[3px] dark:bg-white/[0.07] transition-opacity ${
        disabled
          ? "opacity-50 cursor-not-allowed pointer-events-none"
          : ""
      }`}
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <motion.button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => !disabled && onChange(opt.value)}
            aria-pressed={isActive}
            className={`relative inline-flex h-full cursor-pointer items-center whitespace-nowrap rounded-[8px] border-0 bg-transparent px-[12px] text-[13px] leading-none transition-colors ${
              isActive
                ? "text-text-primary"
                : disabled
                  ? "text-text-tertiary/70 cursor-not-allowed"
                  : "text-text-secondary hover:text-text-primary"
            }`}
            style={{ fontWeight: 500 }}
          >
            {isActive && (
              <motion.span
                layoutId={`segmented-active-${groupId}`}
                className="absolute inset-0 rounded-[8px] bg-black/[0.07] dark:bg-white/[0.12]"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
                aria-hidden="true"
              />
            )}
            <span className="relative z-[1]">{opt.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
