import { useEffect, useRef } from "react";
import { App as NativeApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { useNavigate } from "react-router-dom";
import { api, toClientTrack } from "@/shared/api";
import { playerEngine } from "@/features/player";
import { useAuthStore } from "@/features/auth/store/authStore";
import { parseIncomingLink, type IncomingLink } from "@/shared/utils/incomingLink";
import { showToast } from "@/shared/ui/Toast";
import { useTranslation } from "@/languages";
import { startVibe, storedSettings } from "@/features/home/vibe/vibeController";

export default function DeeplinkHandler() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const status = useAuthStore(state => state.status);
  const pending = useRef<IncomingLink | null>(null);
  const statusRef = useRef(status);
  const dispatchRef = useRef<(target: IncomingLink) => void>(() => {});
  statusRef.current = status;
  dispatchRef.current = target => {
    if (statusRef.current !== "authenticated") { pending.current = target; return; }
    void (async () => {
      try {
        let entity = target;
        if (entity.type === "share") {
          const shared = await api.getShare(entity.id);
          entity = { type: shared.type, id: shared.entityId };
        }
        switch (entity.type) {
          case "artist": navigate(`/artist?id=${encodeURIComponent(entity.id)}`); break;
          case "album": case "playlist": navigate(`/collection?type=${entity.type}&id=${encodeURIComponent(entity.id)}`); break;
          case "track": {
            const track = toClientTrack(await api.getTrack(entity.id));
            playerEngine.playTrack(track, [track], track.artists, track.coverUrl);
            navigate("/player"); break;
          }
          case "shortcut":
            if (entity.id === "settings") navigate("/settings");
            else if (entity.id === "likes") navigate("/library/playlist?id=likes");
            else { navigate("/"); await startVibe(storedSettings()); }
            break;
        }
      } catch { showToast(t("sharing.open_failed"), "error"); }
    })();
  };

  useEffect(() => {
    if (status === "authenticated" && pending.current) {
      const target = pending.current;
      // Allow AuthLock to finish its post-login redirect first.
      const timer = setTimeout(() => { pending.current = null; dispatchRef.current(target); }, 0);
      return () => clearTimeout(timer);
    }
  }, [status]);

  useEffect(() => {
    let disposed = false;
    let lastUrl = "", lastTime = 0;
    const receiveUrl = (raw: string) => {
      if (disposed) return;
      // Some Android versions deliver the launch intent through both APIs.
      if (raw === lastUrl && Date.now() - lastTime < 1500) return;
      lastUrl = raw; lastTime = Date.now();
      const target = parseIncomingLink(raw);
      if (target) dispatchRef.current(target);
    };
    const off = window.linerElectron?.onDeeplink(target => dispatchRef.current(target));
    const listener = Capacitor.isNativePlatform()
      ? NativeApp.addListener("appUrlOpen", event => receiveUrl(event.url)) : null;
    // Subscribe before retrieving the cold-start URL, so a warm intent cannot be lost.
    if (listener) void listener.then(async () => {
      const launch = await NativeApp.getLaunchUrl();
      if (launch?.url) receiveUrl(launch.url);
    }).catch(() => {});
    return () => { disposed = true; off?.(); if (listener) void listener.then(handle => handle.remove()); };
  }, []);
  return null;
}
