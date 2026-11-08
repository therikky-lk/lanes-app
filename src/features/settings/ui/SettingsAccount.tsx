import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/features/auth";
import { useModalStore } from "@/features/library";
import { useTranslation } from "@/languages";
import UserAvatar from "@/shared/ui/UserAvatar";

export default function SettingsAccount({ compact = false }: { onSignOut?: () => void; compact?: boolean }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const user = useAuthStore(state => state.user);
  const displayName = user?.displayName || user?.username || user?.email?.split("@")[0] || "Lane";

  const openProfile = () => {
    useModalStore.getState().closeSettings();
    navigate("/profile");
  };

  return (
    <button
      type="button"
      aria-label={t("settings.profile.title")}
      onClick={openProfile}
      className="flex min-w-0 max-w-full cursor-pointer items-center gap-[10px] rounded-full border-0 bg-transparent p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary/50"
    >
      <UserAvatar user={user} size={40} className="!rounded-full !border-0" />
      {user && !compact && <span className="max-w-[160px] truncate text-[18px] font-[650] text-text-primary">{displayName}</span>}
    </button>
  );
}
