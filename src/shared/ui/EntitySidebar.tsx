import type { ReactNode } from "react";
import { ArrowLeftLine } from "@mingcute/react";
import { useIsMobile } from "@/shared/hooks/useIsMobile";

export const SIDEBAR_TITLE_CLASS =
  "m-0 text-[22px] leading-[1.2] tracking-[-0.02em] text-text-primary line-clamp-2";

export const SIDEBAR_SUBTITLE_CLASS =
  "m-0 text-[13px] leading-[1.55] text-text-secondary line-clamp-3";

export interface EntitySidebarProps {
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
      <aside className="flex w-full flex-col items-center text-center" data-no-window-drag>
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
          className={`relative flex aspect-square w-[min(72vw,300px)] items-center justify-center overflow-hidden rounded-xl shadow-[0_16px_50px_rgba(0,0,0,0.45)] ${
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
        {primaryAction && <div className="mt-[18px] w-full max-w-[340px]">{primaryAction}</div>}
        {actions && <div className="mt-[8px] flex w-full max-w-[340px] items-center justify-center gap-[8px]">{actions}</div>}
      </aside>
    );
  }
  return (
    <aside className="sticky top-[20px] w-[280px] shrink-0 self-start" data-no-window-drag>
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
        className={`relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-md ${
          coverClassName || "bg-border-alpha-14"
        } ${onBack ? "mt-[16px]" : ""}`}
      >
        {cover}
      </div>

      <div
        className="mt-[16px] min-w-0"
        style={{ fontFamily: "var(--font-inter), sans-serif", fontWeight: 600 }}
      >
        {title}
      </div>

      {subtitle && (
        <div
          className="mt-[6px]"
          style={{ fontFamily: "var(--font-inter), sans-serif" }}
        >
          {subtitle}
        </div>
      )}

      {meta && (
        <div
          className="m-0 mt-[8px] text-[12px] leading-[1.4] text-text-tertiary"
          style={{ fontFamily: "var(--font-inter), sans-serif", fontWeight: 400 }}
        >
          {meta}
        </div>
      )}

      {primaryAction && <div className="mt-[16px]">{primaryAction}</div>}

      {actions && (
        <div className="mt-[8px] flex items-center gap-[8px]">{actions}</div>
      )}
    </aside>
  );
}

export default EntitySidebar;
