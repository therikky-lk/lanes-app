import { useState } from "react";
import { LuSend } from "react-icons/lu";
import Button from "./Button";
import { showToast } from "./Toast";
import { useTranslation } from "@/languages";
import { shareEntity } from "@/shared/utils/share";
import type { ShareEntityType, ShareSnapshot } from "@/shared/contracts/sharing";
export default function ShareButton({ type, entityId, snapshot }: { type: ShareEntityType; entityId: string; snapshot: ShareSnapshot }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  return <Button variant="outline" disabled={busy} title={t("common.share")} aria-label={t("common.share")}
    className="!h-[36px] !w-[36px] shrink-0 !p-0 flex items-center justify-center !border-accent-primary/25 !bg-accent-primary/10 !text-accent-primary transition-colors hover:!bg-accent-primary/20"
    onClick={async () => {
      if (busy) return;
      setBusy(true);
      try { const result = await shareEntity(type, entityId, snapshot); if (result === "copied") showToast(t("sharing.copied"), "checkmark"); }
      catch { showToast(t("sharing.failed"), "error"); }
      finally { setBusy(false); }
    }}><LuSend size={16} strokeWidth={2.2} /></Button>;
}
