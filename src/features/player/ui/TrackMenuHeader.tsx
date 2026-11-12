import CoverImage from "@/features/covers/ui/CoverImage";

export default function TrackMenuHeader({ coverUrl, title, artists }: {
  coverUrl: string;
  title: string;
  artists?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-4 px-2 pb-2">
      <div className="relative size-[112px] shrink-0 overflow-hidden rounded-[14px] bg-bg-elevated">
        <CoverImage src={coverUrl} alt="" fill sizes="112px" placeholder="empty" className="object-cover" />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="m-0 line-clamp-2 text-[17px] font-semibold leading-snug text-text-primary">{title}</h2>
        {artists && <p className="m-0 mt-1 truncate text-[14px] text-text-secondary">{artists}</p>}
      </div>
    </div>
  );
}
