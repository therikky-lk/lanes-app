import type { ReactNode } from "react";
import { ArrowLeftLine } from "@mingcute/react";
import { useIsMobile } from "@/shared/hooks/useIsMobile";

export const SIDEBAR_TITLE_CLASS =
  "m-0 text-[22px] leading-[1.2] tracking-[-0.02em] text-text-primary line-clamp-2";

export const SIDEBAR_SUBTITLE_CLASS =
  "m-0 text-[13px] leading-[1.55] text-text-secondary line-clamp-3";

export interface EntitySidebarProps {
  layout?: "sidebar" | "hero";
  stretchMobile?: boolean;
  cover: ReactNode;
  coverClassName?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  primaryAction?: ReactNode;
  actions?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
}

export function EntitySidebar({
  layout = "sidebar",
  stretchMobile = false,
  cover,
  coverClassName,
  title,
  subtitle,
  meta,
  primaryAction,
  actions,
  onBack,
  backLabel = "Back",
}: EntitySidebarProps) {
  // phones: one centred column, cover, title, one line of artists, the play
  // button and a single row of actions; the extra meta line is left out
  const mobile = useIsMobile();
  if (mobile) {
    return (
      <aside className={`flex w-full flex-col text-center ${stretchMobile ? "items-stretch" : "items-center"}`} data-no-window-drag>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="self-start inline-flex h-[32px] cursor-pointer items-center gap-[6px] rounded-md border-0 bg-transparent px-[8px] ml-[-8px] text-[13px] font-[500] text-text-tertiary"
            style={{ fontFamily: "var(--font-inter), sans-serif" }}
          >
            <ArrowLeftLine size={16} />
            <span>{backLabel}</span>
          </button>
        )}
        <div
          className={`relative flex aspect-square w-[min(72vw,300px)] self-center items-center justify-center overflow-hidden rounded-xl shadow-[0_16px_50px_rgba(0,0,0,0.45)] ${
            coverClassName || "bg-border-alpha-14"
          } ${onBack ? "mt-[12px]" : ""}`}
        >
          {cover}
        </div>
        <div className="mt-[18px] w-full min-w-0 [&_h1]:text-center [&_h1]:text-[24px]" style={{ fontFamily: "var(--font-inter), sans-serif", fontWeight: 650 }}>
          {title}
        </div>
        {subtitle && (
          <div
            className="mt-[6px] w-full min-w-0 [&_p]:justify-center [&_p]:line-clamp-1"
            style={{ fontFamily: "var(--font-inter), sans-serif" }}
          >
            {subtitle}
          </div>
        )}
        {primaryAction && <div className={`mt-[18px] w-full ${stretchMobile ? "" : "max-w-[340px] self-center"}`}>{primaryAction}</div>}
        {actions && <div className={`mt-[8px] flex w-full items-center justify-center gap-[8px] ${stretchMobile ? "" : "max-w-[340px] self-center"}`}>{actions}</div>}
      </aside>
    );
  }
  return (
    <aside
      className={layout === "hero"
        ? "grid w-full min-w-0 grid-cols-[168px_minmax(0,1fr)] grid-rows-[auto_auto_auto_auto_auto] items-start gap-x-[22px] gap-y-[4px] max-md:flex max-md:w-full max-md:flex-col max-md:items-center max-md:gap-0"
        : "sticky top-[20px] w-[280px] shrink-0 self-start"}
      data-no-window-drag
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-[32px] cursor-pointer items-center gap-[6px] rounded-md border-0 bg-transparent px-[8px] ml-[-8px] text-[13px] font-[500] text-text-tertiary transition-colors hover:bg-border-alpha-14 hover:text-text-primary"
          style={{ fontFamily: "var(--font-inter), sans-serif" }}
        >
          <ArrowLeftLine size={16} />
          <span className="relative -left-[1.5px] top-[1px]">{backLabel}</span>
        </button>
      )}

      <div
        data-entity-cover
        className={`relative flex aspect-square w-full items-center justify-center overflow-hidden ${layout === "hero" ? "col-start-1 row-span-5 row-start-1 h-[168px] w-[168px] rounded-[10px] max-md:mt-[12px] max-md:h-auto max-md:w-[min(72vw,300px)] max-md:rounded-xl" : "rounded-md"} ${
          coverClassName || "bg-border-alpha-14"
        } ${onBack ? "mt-[16px]" : ""}`}
      >
        {cover}
      </div>

      <div
        data-entity-title
        className={`${layout === "hero" ? "col-start-2 row-start-1 mt-0 min-w-0 [&>h1]:text-[30px] [&>h1]:line-clamp-1 max-md:mt-[18px] max-md:w-full max-md:text-center max-md:[&>h1]:text-[24px]" : "mt-[16px] min-w-0"}`}
        style={{ fontFamily: "var(--font-inter), sans-serif", fontWeight: 600 }}
      >
        {title}
      </div>

      {subtitle && (
        <div
          data-entity-subtitle
          className={layout === "hero" ? "col-start-2 row-start-2 mt-0 min-w-0 [&>p]:text-[15px] max-md:mt-[6px] max-md:w-full max-md:text-center" : "mt-[6px]"}
          style={{ fontFamily: "var(--font-inter), sans-serif" }}
        >
          {subtitle}
        </div>
      )}

      {meta && (
        <div
          data-entity-meta
          className={`m-0 text-[12px] leading-[1.4] text-text-tertiary ${layout === "hero" ? "col-start-2 row-start-3 mt-[8px] max-md:mt-[12px] max-md:flex max-md:justify-center" : "mt-[8px]"}`}
          style={{ fontFamily: "var(--font-inter), sans-serif", fontWeight: 400 }}
        >
          {meta}
        </div>
      )}

      {primaryAction && <div data-entity-primary className={layout === "hero" ? "col-start-2 row-start-4 mt-[12px] min-w-0 max-md:mt-[16px] max-md:w-full" : "mt-[16px]"}>{primaryAction}</div>}

      {actions && (
        <div data-entity-actions className={layout === "hero" ? "col-start-2 row-start-5 mt-[8px] flex items-center gap-[8px] max-md:mt-[8px]" : "mt-[8px] flex items-center gap-[8px]"}>{actions}</div>
      )}
    </aside>
  );
}

export default EntitySidebar;
