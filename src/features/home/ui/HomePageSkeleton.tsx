import { memo } from "react";
import { useIsMobile } from "@/shared/hooks/useIsMobile";

const TITLE_WIDTHS = ["w-[78%]", "w-[88%]", "w-[68%]", "w-[82%]", "w-[72%]", "w-[85%]"];
const ARTIST_WIDTHS = ["w-[52%]", "w-[44%]", "w-[60%]", "w-[48%]", "w-[56%]", "w-[40%]"];

function SectionTitle({ width = "w-[170px]", marginTop = "mt-[22px]" }: { width?: string; marginTop?: string }) {
  return (
    <div className={`${marginTop} flex items-center gap-[10px] px-[32px]`}>
      <div className="skeleton-shimmer h-[20px] w-[20px] shrink-0 rounded-[4px]" />
      <div className={`skeleton-shimmer h-[22px] ${width} rounded-[5px]`} />
    </div>
  );
}

function QuickCardsSkeleton() {
  return (
    <div className="mt-[18px] mb-[12px] grid grid-cols-1 gap-x-[10px] gap-y-[8px] px-[32px] min-[460px]:grid-cols-2 md:gap-x-[8px] md:gap-y-[2px]">
      {[0, 1].map((index) => (
        <div key={index} className="flex h-[64px] min-w-0 items-center gap-[12px] overflow-hidden rounded-xl bg-white/[0.05] px-[8px] md:h-[72px] md:gap-[14px] md:px-[10px]">
          <div className="skeleton-shimmer h-[44px] w-[44px] shrink-0 rounded-[10px] md:h-[52px] md:w-[52px]" />
          <div className="flex min-w-0 flex-1 flex-col gap-[7px]">
            <div className={`skeleton-shimmer h-[14px] rounded-[4px] ${index === 0 ? "w-[96px]" : "w-[82px]"}`} />
            <div className={`skeleton-shimmer h-[11px] rounded-[4px] ${index === 0 ? "w-[58px]" : "w-[72%]"}`} />
          </div>
          <div className="skeleton-shimmer h-[38px] w-[38px] shrink-0 rounded-md md:h-[44px] md:w-[44px]" />
        </div>
      ))}
    </div>
  );
}

function CardRowSkeleton({ count = 7, width = "w-[175px]" }: { count?: number; width?: string }) {
  const isMobile = useIsMobile();
  return (
    <div className={isMobile ? "grid grid-cols-2 gap-x-[12px] gap-y-[16px] px-[14px]" : "flex gap-[28px] overflow-hidden px-[32px]"}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className={isMobile ? "min-w-0" : `shrink-0 ${width}`}>
          <div className="relative aspect-square w-full overflow-hidden rounded-md bg-border-alpha-14">
            <div className="skeleton-shimmer h-full w-full" />
          </div>
          <div className="mt-[8px] flex flex-col gap-[6px]">
            <div className={`skeleton-shimmer h-[14px] ${TITLE_WIDTHS[index % TITLE_WIDTHS.length]} rounded-[4px]`} />
            <div className={`skeleton-shimmer h-[12px] ${ARTIST_WIDTHS[index % ARTIST_WIDTHS.length]} rounded-[4px]`} />
          </div>
        </div>
      ))}
    </div>
  );
}

function DailyMixesSkeleton() {
  return (
    <section>
      <SectionTitle width="w-[150px]" marginTop="mt-[8px]" />
      <div className="mt-[3px] flex gap-[28px] overflow-hidden pl-8 pr-8 pb-[2px] pt-0">
        {Array.from({ length: 7 }).map((_, index) => (
          <div key={index} className="w-[175px] shrink-0">
            <div className="skeleton-shimmer aspect-square w-full rounded-[12px]" />
          </div>
        ))}
      </div>
    </section>
  );
}

function TrendsSkeleton() {
  return (
    <section>
      <div className="mt-[26px] flex items-center justify-between gap-[12px] px-[32px]">
        <div className="flex items-center gap-[10px]">
          <div className="skeleton-shimmer h-[20px] w-[20px] rounded-[4px]" />
          <div className="skeleton-shimmer h-[22px] w-[120px] rounded-[5px]" />
        </div>
        <div className="skeleton-shimmer h-[42px] w-[170px] rounded-xl" />
      </div>
      <div className="mt-[10px] grid grid-cols-1 gap-x-[16px] px-[32px] md:grid-cols-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="grid h-[60px] min-w-0 grid-cols-[26px_44px_minmax(0,1fr)_34px_44px] items-center gap-[12px] px-[8px]">
            <div className="skeleton-shimmer mx-auto h-[14px] w-[16px] rounded-[3px]" />
            <div className="skeleton-shimmer h-[44px] w-[44px] rounded-md" />
            <div className="flex min-w-0 flex-col gap-[6px]">
              <div className="skeleton-shimmer h-[14px] w-[68%] rounded-[4px]" />
              <div className="skeleton-shimmer h-[12px] w-[46%] rounded-[4px]" />
            </div>
            <div className="skeleton-shimmer h-[30px] w-[30px] rounded-md" />
            <div className="skeleton-shimmer h-[12px] w-[34px] rounded-[4px]" />
          </div>
        ))}
      </div>
    </section>
  );
}

interface HomePageSkeletonProps {
  className?: string;
  glowClass?: string;
  showQuickGrid?: boolean;
}

function HomePageSkeleton({ className = "" }: HomePageSkeletonProps) {
  return (
    <div className={`relative min-h-full w-full overflow-hidden bg-transparent pb-[16px] select-none ${className}`}>
      <QuickCardsSkeleton />
      <DailyMixesSkeleton />
      <TrendsSkeleton />
      <SectionTitle width="w-[190px]" />
      <CardRowSkeleton />
      <SectionTitle width="w-[170px]" />
      <CardRowSkeleton />
      <SectionTitle width="w-[210px]" />
      <CardRowSkeleton />
    </div>
  );
}

export default memo(HomePageSkeleton);
