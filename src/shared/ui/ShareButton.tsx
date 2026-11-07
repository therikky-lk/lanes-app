import { useState } from "react";
import { LuEllipsis, LuShare2, LuSend } from "react-icons/lu";
import Button from "./Button";
import { showToast } from "./Toast";
import { useTranslation } from "@/languages";
import { shareEntity } from "@/shared/utils/share";
import type { ShareEntityType, ShareSnapshot } from "@/shared/contracts/sharing";
import DropdownMenu from "./DropdownMenu";
import type { DropdownMenuItem } from "./DropdownMenu";
import { LANE_LINK_ORIGIN } from "@/shared/api/baseUrl";

export default function ShareButton({ type, entityId, snapshot, menu = false }: {
  type: ShareEntityType; entityId: string; snapshot: ShareSnapshot; menu?: boolean;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const handleShare = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await shareEntity(type, entityId, snapshot);
      if (result === "copied") showToast(t("sharing.copied"), "checkmark");
    } catch {
      if (type === "artist") {
        // Keep artist sharing usable even if the rich-preview link service is unreachable.
        try {
          const fallbackUrl = `${LANE_LINK_ORIGIN}/#/artist?id=${encodeURIComponent(entityId)}`;
          if (navigator.share) await navigator.share({ title: snapshot.title, url: fallbackUrl });
          else { await navigator.clipboard.writeText(fallbackUrl); showToast(t("sharing.copied"), "checkmark"); }
        } catch (fallbackError) {
          if (!(fallbackError instanceof Error && fallbackError.name === "AbortError")) showToast(t("sharing.failed"), "error");
        }
      } else showToast(t("sharing.failed"), "error");
    } finally { setBusy(false); }
  };
  if (menu) {
    const items: DropdownMenuItem[] = [{
      id: "share-artist", label: t("common.share"), icon: <LuShare2 size={15} />, disabled: busy,
      onClick: handleShare,
    }];
    return <DropdownMenu
      trigger={<Button variant="outline" disabled={busy} title={t("common.more")} aria-label={t("common.more")}
        className="!h-[38px] !w-[38px] shrink-0 !p-0 flex items-center justify-center text-text-secondary hover:text-text-primary bg-bg-panel/40 backdrop-blur-sm">
        <LuEllipsis size={19} />
      </Button>}
      items={items}
    />;
  }
  return <Button variant="outline" disabled={busy} title={t("common.share")} aria-label={t("common.share")}
    className="!h-[36px] !w-[36px] shrink-0 !p-0 flex items-center justify-center !border-accent-primary/25 !bg-accent-primary/10 !text-accent-primary transition-colors hover:!bg-accent-primary/20"
    onClick={handleShare}><LuSend size={16} strokeWidth={2.2} /></Button>;
}
