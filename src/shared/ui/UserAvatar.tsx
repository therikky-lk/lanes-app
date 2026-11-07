import { useState, useMemo } from "react";
import { FaUser } from "react-icons/fa";
import { useLocalAvatar } from "@/features/auth/store/localAvatarStore";

export interface UserAvatarProps {
  user?: {
    id?: string;
    avatarUrl?: string | null;
    displayName?: string | null;
    username?: string | null;
    email?: string | null;
  } | null;
  size?: number;
  className?: string;
}

export function UserAvatar({ user, size = 36, className = "" }: UserAvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const avatarUrl = useLocalAvatar(user?.id, user?.avatarUrl);

  const initial = useMemo(() => {
    if (!user) return "";
    const name = user.displayName?.trim() || user.username?.trim() || user.email?.trim() || "";
    return name ? name[0].toUpperCase() : "";
  }, [user]);

  const hasImage = Boolean(avatarUrl && failedUrl !== avatarUrl);

  return (
    <div
      className={`rounded-[6px] bg-border-alpha-14 flex items-center justify-center text-text-secondary border border-border-primary/50 flex-shrink-0 overflow-hidden select-none ${className}`}
      style={{ width: size, height: size }}
    >
      {hasImage ? (
        <img
          src={avatarUrl!}
          alt={user?.displayName || user?.username || "Avatar"}
          className="w-full h-full object-cover"
          onError={() => setFailedUrl(avatarUrl)}
          draggable={false}
        />
      ) : initial ? (
        <span
          className="text-text-primary font-medium select-none"
          style={{ fontSize: Math.max(12, Math.floor(size * 0.42)) }}
        >
          {initial}
        </span>
      ) : (
        <FaUser size={Math.floor(size * 0.45)} />
      )}
    </div>
  );
}

export default UserAvatar;
