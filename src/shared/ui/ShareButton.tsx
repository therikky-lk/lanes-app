import { useState } from "react";
import { LuEllipsis, LuShare2 } from "react-icons/lu";
import Button from "./Button";
import type { ButtonProps } from "./Button";
import { showToast } from "./Toast";
import { useTranslation } from "@/languages";
import { shareEntity } from "@/shared/utils/share";
import type { ShareEntityType, ShareSnapshot } from "@/shared/contracts/sharing";
import DropdownMenu from "./DropdownMenu";
import type { DropdownMenuItem } from "./DropdownMenu";
import { resolveApiErrorMessage } from "@/shared/api/api";
import { resolveArtistAvatar } from "@/features/artist/hooks/artistAvatar";

export default function ShareButton({ type, entityId, snapshot, menu = true, extraMenuItems = [], className = "", variant = "outline" }: {
  type: ShareEntityType; entityId: string; snapshot: ShareSnapshot; menu?: boolean; extraMenuItems?: DropdownMenuItem[]; className?: string;
  variant?: ButtonProps["variant"];
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const handleShare = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const coverUrl = type === "artist"
        ? (snapshot.coverUrl?.startsWith("https://")
          ? snapshot.coverUrl
          : await resolveArtistAvatar(entityId, snapshot.title) ?? undefined)
        : snapshot.coverUrl;
      const result = await shareEntity(type, entityId, { ...snapshot, coverUrl });
      if (result === "copied") showToast(t("sharing.copied"), "checkmark");
    } catch (error) {
      showToast(resolveApiErrorMessage(error, t, "sharing.failed"), "error");
    } finally { setBusy(false); }
  };
  if (menu) {
    const items: DropdownMenuItem[] = [{
      id: "share-artist", label: t("common.share"), icon: <LuShare2 size={15} />, disabled: busy,
      onClick: handleShare,
    }, ...extraMenuItems];
    return <DropdownMenu
      trigger={<Button variant={variant} size="icon" disabled={busy} title={t("common.more")} aria-label={t("common.more")}
        className={`!h-[36px] !w-[36px] shrink-0 !p-0 flex items-center justify-center text-text-secondary hover:text-text-primary ${className}`}>
        <LuEllipsis size={19} />
      </Button>}
      items={items}
    />;
  }
  return <DropdownMenu
    trigger={<Button variant={variant} size="icon" disabled={busy} title={t("common.more")} aria-label={t("common.more")}
      className={`!h-[36px] !w-[36px] shrink-0 !p-0 flex items-center justify-center text-text-secondary hover:text-text-primary ${className}`}>
      <LuEllipsis size={19} />
    </Button>}
    items={[{ id: "share-artist", label: t("common.share"), icon: <LuShare2 size={15} />, disabled: busy, onClick: handleShare }, ...extraMenuItems]}
  />;
}
