import { memo } from "react";
import { useIsMobile } from "@/shared/hooks/useIsMobile";

const TRACK_TITLE_WIDTHS = ["w-[42%]", "w-[34%]", "w-[50%]", "w-[28%]", "w-[46%]", "w-[38%]"];
const TRACK_ARTIST_WIDTHS = ["w-[24%]", "w-[18%]", "w-[28%]", "w-[22%]", "w-[32%]", "w-[20%]"];

export interface PlaylistPageSkeletonProps {
  className?: string;
}

function PlaylistPageSkeletonComponent({ className = "" }: PlaylistPageSkeletonProps) {
  const isMobile = useIsMobile();

  return (
    <div className={`relative h-full w-full overflow-hidden bg-transparent select-none ${className}`}>
      <div
        className={
          isMobile
            ? "relative z-10 flex h-full min-h-0 w-full flex-col items-center overflow-y-auto px-[14px]"
            : "relative z-10 flex h-full min-h-0 w-full flex-col px-[16px]"
        }
      >
        <header
          className={
            isMobile
              ? "flex w-full shrink-0 flex-col items-center pt-[56px] pb-[8px]"
              : "grid w-full shrink-0 grid-cols-[168px_minmax(0,1fr)] grid-rows-[auto_auto_auto_auto_auto] items-start gap-x-[22px] gap-y-[8px] pt-[56px] pb-[4px]"
          }
        >
          <div
            className={`skeleton-shimmer relative aspect-square overflow-hidden ${
              isMobile
                ? "mt-[12px] w-[min(72vw,300px)] rounded-xl"
                : "col-start-1 row-span-5 row-start-1 h-[168px] w-[168px] rounded-[10px]"
            }`}
          />

          <div
            className={
              isMobile
                ? "mt-[18px] flex w-full flex-col items-center gap-[8px]"
                : "col-start-2 row-start-1 mt-[4px] flex min-w-0 flex-col gap-[10px]"
            }
          >
            <div className={`skeleton-shimmer h-[30px] w-[min(280px,70%)] rounded-md ${isMobile ? "h-[28px]" : "self-start"}`} />
            <div className={`skeleton-shimmer h-[14px] w-[min(220px,52%)] rounded-sm ${isMobile ? "" : "self-start"}`} />
            <div className={`skeleton-shimmer h-[26px] w-[150px] rounded-md ${isMobile ? "" : "self-start"}`} />
          </div>

          <div
            className={
              isMobile
                ? "mt-[16px] flex w-full max-w-[340px] flex-col gap-[8px]"
                : "col-start-2 row-start-4 mt-[4px] flex w-full max-w-[640px] flex-col gap-[8px]"
            }
          >
            <div className="skeleton-shimmer h-[36px] w-full rounded-md" />
            <div className="flex items-center gap-[8px]">
              <div className="skeleton-shimmer h-[36px] flex-1 rounded-md" />
              <div className="skeleton-shimmer h-[36px] w-[36px] rounded-md" />
              <div className="skeleton-shimmer h-[36px] w-[36px] rounded-md" />
            </div>
          </div>
        </header>

        <section
          className={
            isMobile
              ? "mt-[16px] w-full shrink-0 overflow-hidden rounded-t-[14px] px-0 pt-[8px] pb-[24px]"
              : "mt-[16px] h-full min-h-0 w-full flex-1 overflow-hidden rounded-t-[14px] px-[8px] pt-[8px] pb-[24px]"
          }
        >
          <div className="flex flex-col">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex h-[64px] items-center justify-between rounded-md p-[8px]">
                <div className="flex min-w-0 flex-1 items-center gap-[16px]">
                  <div className="skeleton-shimmer h-[48px] w-[48px] shrink-0 rounded-md" />
                  <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
                    <div className={`skeleton-shimmer h-[15px] ${TRACK_TITLE_WIDTHS[i % TRACK_TITLE_WIDTHS.length]} rounded-[4px]`} />
                    <div className={`skeleton-shimmer h-[13px] ${TRACK_ARTIST_WIDTHS[i % TRACK_ARTIST_WIDTHS.length]} rounded-[4px]`} />
                  </div>
                </div>
                <div className="flex items-center gap-[16px] pr-[8px]">
                  <div className="skeleton-shimmer h-[13px] w-[36px] rounded-[4px]" />
                  <div className="skeleton-shimmer h-[32px] w-[32px] rounded-md" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

const PlaylistPageSkeleton = memo(PlaylistPageSkeletonComponent);
export default PlaylistPageSkeleton;
