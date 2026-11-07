import { LuCircleArrowDown } from "react-icons/lu";
import { useTranslation } from "@/languages";
import { useOfflineLibraryStore } from "./offlineLibraryStore";

export function CachedTrackIndicator({ id }: { id?: string }) {
  const cached = useOfflineLibraryStore(state => !!id && state.cachedTrackIds.has(id));
  const { t } = useTranslation();
  return cached ? <span className="mr-[5px] inline-flex shrink-0 text-green-500" role="img" aria-label={t("common.cache_saved")} title={t("common.cache_saved")}><LuCircleArrowDown size={14} /></span> : null;
}
