import { useEffect, useState } from "react";
import { FaSpotify } from "react-icons/fa";
import Dialog from "@/shared/ui/Dialog";
import Button from "@/shared/ui/Button";
import { useTranslation } from "@/languages";
import { useImportStore } from "../store/importStore";
import {
  SPOTIFY_LIKED_URL,
  spotifyAccountSupported,
  spotifyHasLogin,
  spotifyLikedCount,
  spotifyLogin,
  spotifyLogout,
} from "../services/import/sources/spotify/spotifyAccount";

type Step = "checking" | "signin" | "counting" | "ready" | "error" | "unsupported";

/** sign in to Spotify, see how many Liked Songs there are, import them */
export default function SpotifyLikedImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const tr = (key: string, fallback: string, vars?: Record<string, unknown>) => {
    const v = t(key, vars as never);
    return v && v !== key ? v : fallback;
  };
  const [step, setStep] = useState<Step>("checking");
  const [count, setCount] = useState(0);
  const [error, setError] = useState("");

  const loadCount = async () => {
    setStep("counting");
    try {
      setCount(await spotifyLikedCount());
      setStep("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("error");
    }
  };

  useEffect(() => {
    if (!open) return;
    if (!spotifyAccountSupported()) {
      setStep("unsupported");
      return;
    }
    setStep("checking");
    void spotifyHasLogin().then((ok) => (ok ? loadCount() : setStep("signin")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const font = { fontFamily: "var(--font-inter), sans-serif" } as const;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()} maxWidth={400} className="p-[22px]">
      <div className="flex flex-col items-center gap-[14px] text-center" style={font}>
        <span className="inline-flex h-[56px] w-[56px] items-center justify-center rounded-2xl bg-[#1ed760] text-black">
          <FaSpotify size={30} />
        </span>
        <h3 className="m-0 text-[18px] font-[600] text-text-primary">
          {tr("library.spotify_liked.title", "Transfer Liked Songs from Spotify")}
        </h3>

        {step === "unsupported" && (
          <p className="m-0 text-[13.5px] text-text-secondary">
            {tr("library.spotify_liked.unsupported", "Available in the Lane app for desktop and Android.")}
          </p>
        )}

        {(step === "checking" || step === "counting") && (
          <div className="h-[24px] w-[24px] animate-spin rounded-full border-[2px] border-text-tertiary border-t-text-secondary" />
        )}

        {step === "signin" && (
          <>
            <p className="m-0 text-[13.5px] text-text-secondary">
              {tr("library.spotify_liked.signin_desc", "Sign in to your Spotify account to see your Liked Songs.")}
            </p>
            <Button
              className="w-full justify-center !bg-[#1ed760] !text-black"
              onClick={async () => {
                const ok = await spotifyLogin();
                if (ok) void loadCount();
              }}
            >
              {tr("library.spotify_liked.signin", "Sign in to Spotify")}
            </Button>
          </>
        )}

        {step === "ready" && (
          <>
            <p className="m-0 text-[14px] text-text-secondary">
              {tr("library.spotify_liked.count", `You can import ${count} tracks`, { count })}
            </p>
            <Button
              className="w-full justify-center !bg-[#1ed760] !text-black"
              disabled={count === 0}
              onClick={() => {
                onClose();
                void useImportStore.getState().startImport(SPOTIFY_LIKED_URL);
              }}
            >
              {tr("library.spotify_liked.import", "Import")}
            </Button>
            <button
              type="button"
              onClick={async () => {
                await spotifyLogout();
                setStep("signin");
              }}
              className="border-0 bg-transparent text-[12.5px] text-text-tertiary underline cursor-pointer"
            >
              {tr("library.spotify_liked.signout", "Use another Spotify account")}
            </button>
          </>
        )}

        {step === "error" && (
          <>
            <p className="m-0 text-[13px] text-[#E5484D]">{error}</p>
            <Button variant="secondary" className="w-full justify-center" onClick={() => setStep("signin")}>
              {tr("library.spotify_liked.retry", "Sign in again")}
            </Button>
          </>
        )}
      </div>
    </Dialog>
  );
}
