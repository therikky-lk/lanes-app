import type { ReactNode } from "react";
import { AddLine, PlayFill } from "@mingcute/react";
import { LuShuffle } from "react-icons/lu";
import { useTranslation } from "@/languages";
import EntitySidebar from "@/shared/ui/EntitySidebar";
import Button from "@/shared/ui/Button";
import OfflineCover from "./OfflineCover";
import { TrackSearchButton } from "./TrackSearch";

export default function TrackCollectionHeader({ title, kind, count, onPlay, onQueue, onShuffle, onSearch, searchOpen, extra }: {
  title: string; kind: "cache" | "local"; count: number;
  onPlay: () => void; onQueue: () => void; onShuffle: () => void;
  onSearch: () => void; searchOpen: boolean; extra?: ReactNode;
}) {
  const { t } = useTranslation();
  return <div className="w-full shrink-0 px-[14px] pt-[16px] pb-[12px]">
    <EntitySidebar layout="hero" stretchMobile cover={<OfflineCover kind={kind} />} title={<h1 className="m-0 text-[28px] font-bold text-text-primary">{title}</h1>}
      primaryAction={<Button className="w-fit max-md:w-full" disabled={!count} onClick={onPlay}><PlayFill size={18} />{t("common.play_all")}</Button>}
      actions={<div className="flex w-fit max-md:w-full items-center gap-[8px]">
        <Button variant="secondary" className="min-w-0 flex-none max-md:flex-1" disabled={!count} onClick={onQueue}><AddLine size={18} /><span className="truncate">{t("common.add_to_queue")}</span></Button>
        <Button variant="secondary" size="icon" disabled={!count} onClick={onShuffle} aria-label={t("common.shuffle")}><LuShuffle size={18} /></Button>
        <TrackSearchButton search={{ isOpen: searchOpen, toggle: onSearch }} disabled={!count} />
        {extra}
      </div>}
    />
  </div>;
}
