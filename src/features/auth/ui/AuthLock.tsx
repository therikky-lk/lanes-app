import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { getAuthSession } from "@/shared/api";
import AppFrame from "@/features/navigation/ui/AppFrame";
import { useWindowState } from "@/features/navigation/hooks/useWindowState";
import { syncYoutubeAuthState } from "@/shared/media/youtube/auth/youtubeAuthSession";

export function AuthLock({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const status = useAuthStore((state) => state.status);
  const initialize = useAuthStore((state) => state.initialize);
  const refreshProfile = useAuthStore((state) => state.refreshProfile);
  // keeps the body's outer padding in step with maximize / fullscreen on every screen,
  // including login and the startup spinner (the app frame mounts its own copy too)
  useWindowState();

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    if (status !== "authenticated") return;
    const refreshSharedState = () => {
      if (document.visibilityState === "hidden") return;
      void refreshProfile();
      void syncYoutubeAuthState().catch(() => undefined);
    };
    refreshSharedState();
    const interval = window.setInterval(refreshSharedState, 30_000);
    window.addEventListener("focus", refreshSharedState);
    document.addEventListener("visibilitychange", refreshSharedState);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshSharedState);
      document.removeEventListener("visibilitychange", refreshSharedState);
    };
  }, [refreshProfile, status]);

  useEffect(() => {
    const syncExpiredSession = () => {
      if (!getAuthSession()) void initialize();
    };
    window.addEventListener("auth:changed", syncExpiredSession);
    return () => window.removeEventListener("auth:changed", syncExpiredSession);
  }, [initialize]);

  useEffect(() => {
    if (status === "anonymous" && pathname !== "/login") {
      navigate("/login", { replace: true });
    }
    if (status === "authenticated" && pathname === "/login") {
      navigate("/", { replace: true });
    }
  }, [pathname, navigate, status]);

  if (
    status === "initializing" ||
    (status === "anonymous" && pathname !== "/login") ||
    (status === "authenticated" && pathname === "/login")
  ) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-bg-primary">
        <span className="h-[22px] w-[22px] animate-spin rounded-full border-2 border-text-tertiary border-t-text-primary" />
      </div>
    );
  }

  return pathname === "/login" ? children : <AppFrame>{children}</AppFrame>;
}

export default AuthLock;
