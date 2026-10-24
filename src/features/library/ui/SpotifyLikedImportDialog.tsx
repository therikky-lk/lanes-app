import { useEffect, useState } from "react";
import { FaSpotify } from "react-icons/fa";
import Dialog from "@/shared/ui/Dialog";
import Button from "@/shared/ui/Button";
import { useTranslation } from "@/languages";
import { batteryOptimizationStatus, requestBatteryExemption } from "@/shared/platform/keepAwake";
import {
  spotifyAccountSupported,
  spotifyHasLogin,
  spotifyLikedCount,
  spotifyLogin,
  spotifyLogout,
  SpotifyRateLimitError,
} from "../services/import/sources/spotify/spotifyAccount";
import { BATCH_SIZE, type BatchLog, type ImportItem } from "../services/import/likedImport/likedImportRunner";
import { useLikedImportStore } from "../store/likedImportStore";

type Step = "checking" | "signin" | "counting" | "ready" | "error" | "unsupported";

const RUNNING = new Set(["collecting", "importing", "waiting"]);

function useTr() {
  const { t } = useTranslation();
  return (key: string, fallback: string, vars?: Record<string, unknown>) => {
    const full = `library.spotify_liked.${key}`;
    const v = t(full, vars as never);
    if (v && v !== full) return v;
    return fallback.replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? ""));
  };
}

function useSecondsLeft(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [until]);
  return until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;
}

function trackLine(item: ImportItem): string {
  return `${item.source.artists.join(", ")} — ${item.source.title}`;
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="flex flex-col items-center rounded-lg bg-bg-secondary px-[6px] py-[8px] min-w-0">
      <span className={`text-[16px] font-[600] tabular-nums ${tone ?? "text-text-primary"}`}>{value}</span>
      <span className="text-[11px] text-text-tertiary truncate max-w-full">{label}</span>
    </div>
  );
}

function BatchRow({ log, tr }: { log: BatchLog; tr: ReturnType<typeof useTr> }) {
  const head = log.pass > 1
    ? tr("batch_retry", "Retry batch {n} of {of}", { ...log })
    : tr("batch", "Batch {n} of {of} · tracks {from}–{to}", { ...log });
  return (
    <div className="flex items-center justify-between gap-[8px] py-[5px] text-[12.5px] border-b border-border-primary last:border-0">
      <span className="text-text-secondary truncate">{head}</span>
      <span className="flex shrink-0 gap-[8px] tabular-nums">
        <span className="text-[#1ed760]" title={tr("stat_liked", "Added")}>+{log.liked}</span>
        {log.duplicate > 0 && <span className="text-text-tertiary" title={tr("stat_duplicate", "Already liked")}>={log.duplicate}</span>}
        {log.review > 0 && <span className="text-[#F5A524]" title={tr("stat_review", "To check")}>?{log.review}</span>}
        {log.notFound > 0 && <span className="text-text-tertiary" title={tr("stat_not_found", "Not found")}>∅{log.notFound}</span>}
        {log.failed > 0 && <span className="text-[#E5484D]" title={tr("stat_failed", "Errors")}>!{log.failed}</span>}
      </span>
    </div>
  );
}

function ItemList({ title, items, render }: { title: string; items: { item: ImportItem; index: number }[]; render?: (e: { item: ImportItem; index: number }) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <div className="w-full text-left">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex justify-between border-0 bg-transparent p-0 py-[4px] text-[13px] font-[600] text-text-primary cursor-pointer"
      >
        <span>{title} · {items.length}</span>
        <span className="text-text-tertiary">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="max-h-[180px] overflow-y-auto mt-[4px] pr-[4px]">
          {items.map((e) =>
            render ? (
              <div key={e.index}>{render(e)}</div>
            ) : (
              <div key={e.index} className="py-[3px] text-[12.5px] text-text-secondary truncate">{trackLine(e.item)}</div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/** Android: battery optimization can freeze Lane in the background */
function BatteryHint({ tr }: { tr: ReturnType<typeof useTr> }) {
  const [restricted, setRestricted] = useState(false);
  useEffect(() => {
    const check = () => void batteryOptimizationStatus().then((s) => setRestricted(s.supported && !s.ignoring));
    check();
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, []);
  if (!restricted) return null;
  return (
    <div className="w-full rounded-lg border border-[#F5A524]/40 bg-[#F5A524]/10 p-[10px] text-left">
      <p className="m-0 text-[13px] font-[600] text-text-primary">{tr("battery_title", "Lane may be put to sleep in the background")}</p>
      <p className="m-0 mt-[4px] text-[12.5px] text-text-secondary">
        {tr("battery_desc", "Allow Lane to run without battery restrictions, so the transfer and background playback don't stop.")}
      </p>
      <Button size="sm" variant="secondary" className="mt-[8px]" onClick={() => void requestBatteryExemption()}>
        {tr("battery_allow", "Allow")}
      </Button>
    </div>
  );
}

/** sign in to Spotify, then move Liked Songs into Lane likes batch by batch */
export default function SpotifyLikedImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tr = useTr();
  const [step, setStep] = useState<Step>("checking");
  const [count, setCount] = useState(0);
  /** Spotify asked to wait before counting: the transfer can still start and wait itself */
  const [limited, setLimited] = useState<{ minutes: number } | null>(null);
  const [loginError, setLoginError] = useState("");
  const s = useLikedImportStore();
  const seconds = useSecondsLeft(s.waitUntil);

  const loadCount = async () => {
    setStep("counting");
    try {
      setLimited(null);
      setCount(await spotifyLikedCount());
      setStep("ready");
    } catch (e) {
      if (e instanceof SpotifyRateLimitError) {
        // not a dead end: the transfer waits out the limit on its own
        setLimited({ minutes: Math.max(1, Math.ceil((e.retryAfterMs ?? 60_000) / 60_000)) });
        setCount(-1);
        setStep("ready");
        return;
      }
      setLoginError(e instanceof Error ? e.message : String(e));
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
    void s.restore().then(() => {
      const st = useLikedImportStore.getState();
      // a saved or running transfer already has the list: no extra Spotify request
      if (st.job?.collected || RUNNING.has(st.phase)) {
        setStep("ready");
        return;
      }
      void spotifyHasLogin().then((ok) => (ok ? loadCount() : setStep("signin")));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const font = { fontFamily: "var(--font-inter), sans-serif" } as const;
  const running = RUNNING.has(s.phase);
  const c = s.counts;
  const total = c.total || s.collect.total || count;
  const percent = total ? Math.round((c.done / total) * 100) : 0;
  const items = s.job?.items ?? [];
  const pick = (status: ImportItem["status"]) =>
    items.flatMap((item, index) => (item.status === status ? [{ item, index }] : []));
  const review = pick("review");
  const notFound = pick("not_found");
  const failed = pick("failed");
  const hasJob = Boolean(s.job && s.job.items.length);

  const restart = async () => {
    if (!window.confirm(tr("restart_confirm", "Forget this transfer and start from scratch? Tracks already added stay in your likes."))) return;
    await s.discard();
    void loadCount();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()} maxWidth={460} className="p-0">
      <div className="flex flex-col items-center gap-[14px] text-center overflow-y-auto p-[22px]" style={font}>
        <span className="inline-flex h-[56px] w-[56px] shrink-0 items-center justify-center rounded-2xl bg-[#1ed760] text-black">
          <FaSpotify size={30} />
        </span>
        <h3 className="m-0 text-[18px] font-[600] text-text-primary">
          {tr("title", "Transfer Liked Songs from Spotify")}
        </h3>

        {step === "unsupported" && (
          <p className="m-0 text-[13.5px] text-text-secondary">
            {tr("unsupported", "Available in the Lane app for desktop and Android.")}
          </p>
        )}

        {(step === "checking" || step === "counting") && !hasJob && (
          <div className="h-[24px] w-[24px] animate-spin rounded-full border-[2px] border-text-tertiary border-t-text-secondary" />
        )}

        {step === "signin" && !running && (
          <>
            <p className="m-0 text-[13.5px] text-text-secondary">
              {tr("signin_desc", "Sign in to your Spotify account to see your Liked Songs.")}
            </p>
            <Button
              className="w-full justify-center !bg-[#1ed760] !text-black"
              onClick={async () => {
                const ok = await spotifyLogin();
                if (ok) void loadCount();
              }}
            >
              {tr("signin", "Sign in to Spotify")}
            </Button>
          </>
        )}

        {step === "error" && !running && (
          <>
            <p className="m-0 text-[13px] text-[#E5484D]">{loginError}</p>
            <Button variant="secondary" className="w-full justify-center" onClick={() => setStep("signin")}>
              {tr("retry", "Sign in again")}
            </Button>
          </>
        )}

        {/* a fresh start: how many tracks there are and how it works */}
        {step === "ready" && !hasJob && !running && (
          <>
            {limited ? (
              <p className="m-0 text-[13px] text-[#F5A524]">
                {tr("limited", "Spotify asked to wait about {minutes} min before the next request. You can start now: the transfer waits and continues by itself.", limited)}
              </p>
            ) : (
              <p className="m-0 text-[14px] text-text-primary">{tr("count", "You can import {count} tracks", { count })}</p>
            )}
            <p className="m-0 text-[12.5px] text-text-secondary">{tr("how", "Tracks go into your Lane likes in batches of {size}, oldest first. Progress is saved: you can close this window or the app and continue later.", { size: BATCH_SIZE })}</p>
            <BatteryHint tr={tr} />
            <Button
              className="w-full justify-center !bg-[#1ed760] !text-black"
              disabled={count === 0}
              onClick={() => void s.start()}
            >
              {tr("start", "Start transfer")}
            </Button>
            <button
              type="button"
              onClick={async () => {
                await spotifyLogout();
                setStep("signin");
              }}
              className="border-0 bg-transparent text-[12.5px] text-text-tertiary underline cursor-pointer"
            >
              {tr("signout", "Use another Spotify account")}
            </button>
          </>
        )}

        {/* a transfer that runs, waits, is paused or done */}
        {(hasJob || running) && (
          <>
            <div className="w-full">
              <div className="h-[6px] w-full overflow-hidden rounded-full bg-bg-secondary">
                <div className="h-full rounded-full bg-[#1ed760] transition-[width] duration-300" style={{ width: `${s.phase === "collecting" && s.collect.total ? Math.round((s.collect.read / s.collect.total) * 100) : percent}%` }} />
              </div>
              <p className="m-0 mt-[6px] text-[12.5px] text-text-secondary tabular-nums">
                {s.phase === "collecting"
                  ? tr("collecting", "Reading Spotify likes: {read} of {total}", s.collect)
                  : tr("progress", "{done} of {total} processed", { done: c.done, total })}
              </p>
            </div>

            {s.phase === "importing" && s.current && (
              <p className="m-0 text-[13.5px] font-[600] text-text-primary">
                {s.current.retry
                  ? tr("batch_retry", "Retry batch {n} of {of}", s.current)
                  : tr("batch", "Batch {n} of {of} · tracks {from}–{to}", s.current)}
              </p>
            )}
            {s.phase === "waiting" && (
              <p className="m-0 text-[13px] text-[#F5A524]">
                {s.waitReason === "network"
                  ? tr("wait_network", "No connection, retrying in {sec} s", { sec: seconds })
                  : seconds >= 120
                    ? tr("wait_rate_min", "Spotify asked to wait, resuming in {min} min", { min: Math.ceil(seconds / 60) })
                    : tr("wait_rate", "Hit a rate limit, resuming in {sec} s", { sec: seconds })}
              </p>
            )}
            {s.phase === "paused" && (
              <p className="m-0 text-[13px] text-text-secondary">{tr("paused", "Paused at {done} of {total}. Progress is saved.", { done: c.done, total })}</p>
            )}
            {s.phase === "done" && (
              <p className="m-0 text-[14px] font-[600] text-text-primary">{tr("done", "Done! {liked} tracks added to your likes.", { liked: c.liked })}</p>
            )}
            {s.phase === "error" && s.error && <p className="m-0 text-[13px] text-[#E5484D]">{s.error}</p>}

            <div className="grid w-full grid-cols-5 gap-[6px]">
              <Stat label={tr("stat_liked", "Added")} value={c.liked} tone="text-[#1ed760]" />
              <Stat label={tr("stat_duplicate", "Already liked")} value={c.duplicate} />
              <Stat label={tr("stat_review", "To check")} value={c.review} tone={c.review ? "text-[#F5A524]" : undefined} />
              <Stat label={tr("stat_not_found", "Not found")} value={c.notFound} />
              <Stat label={tr("stat_failed", "Errors")} value={c.failed} tone={c.failed ? "text-[#E5484D]" : undefined} />
            </div>

            {s.log.length > 0 && (
              <div className="w-full text-left">
                <p className="m-0 mb-[2px] text-[12px] uppercase tracking-wide text-text-tertiary">{tr("log_title", "Batches")}</p>
                <div className="max-h-[150px] overflow-y-auto pr-[4px]">
                  {[...s.log].reverse().map((log) => (
                    <BatchRow key={`${log.pass}-${log.n}-${log.at}`} log={log} tr={tr} />
                  ))}
                </div>
              </div>
            )}

            {running && <p className="m-0 text-[12px] text-text-tertiary">{tr("background_hint", "You can close this window, the transfer keeps going.")}</p>}
            {running && <BatteryHint tr={tr} />}

            {!running && (
              <>
                <ItemList
                  title={tr("review_title", "Check these matches")}
                  items={review}
                  render={({ item, index }) => (
                    <div className="flex items-center gap-[8px] py-[5px] border-b border-border-primary last:border-0">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] text-text-primary">{trackLine(item)}</div>
                        <div className="truncate text-[12px] text-text-tertiary">
                          → {item.proposed?.artists.map((a) => a.name).join(", ")} — {item.proposed?.title}
                        </div>
                      </div>
                      <Button size="sm" onClick={() => void s.acceptReview(index)}>{tr("review_add", "Add")}</Button>
                      <Button size="sm" variant="ghost" onClick={() => void s.dismissReview(index)}>{tr("review_skip", "Skip")}</Button>
                    </div>
                  )}
                />
                {review.length > 1 && (
                  <Button size="sm" variant="secondary" className="w-full justify-center" onClick={() => void s.acceptAllReviews()}>
                    {tr("review_add_all", "Add all")}
                  </Button>
                )}
                <ItemList title={tr("not_found_title", "Not found on YouTube Music")} items={notFound} />
                <ItemList title={tr("failed_title", "Couldn't add")} items={failed} />
              </>
            )}

            <div className="flex w-full flex-col gap-[8px]">
              {running && (
                <Button variant="secondary" className="w-full justify-center" onClick={() => s.pause()}>
                  {tr("pause", "Pause")}
                </Button>
              )}
              {(s.phase === "paused" || s.phase === "error") && (
                <Button className="w-full justify-center !bg-[#1ed760] !text-black" onClick={() => void s.start()}>
                  {tr("continue", "Continue")}
                </Button>
              )}
              {s.phase === "done" && failed.length > 0 && (
                <Button className="w-full justify-center" onClick={() => void s.retry(false)}>
                  {tr("retry_failed", "Retry errors")}
                </Button>
              )}
              {s.phase === "done" && notFound.length > 0 && (
                <Button variant="secondary" className="w-full justify-center" onClick={() => void s.retry(true)}>
                  {tr("retry_not_found", "Search the not found again")}
                </Button>
              )}
              {s.phase === "done" && (
                <Button variant="secondary" className="w-full justify-center" onClick={() => void s.start()}>
                  {tr("check_new", "Check for new likes")}
                </Button>
              )}
              {!running && hasJob && (
                <button
                  type="button"
                  onClick={() => void restart()}
                  className="border-0 bg-transparent text-[12.5px] text-text-tertiary underline cursor-pointer"
                >
                  {tr("restart", "Start over")}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

/** a small progress pill for the library page while the transfer runs with the dialog closed */
export function SpotifyLikedImportPill({ onOpen }: { onOpen: () => void }) {
  const tr = useTr();
  const phase = useLikedImportStore((st) => st.phase);
  const counts = useLikedImportStore((st) => st.counts);
  const collect = useLikedImportStore((st) => st.collect);
  if (!RUNNING.has(phase)) return null;
  const total = counts.total || collect.total;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="fixed bottom-[calc(96px+var(--lane-safe-bottom,0px))] right-[16px] z-[60] flex items-center gap-[8px] rounded-full border border-border-primary bg-bg-primary px-[12px] py-[7px] text-[12.5px] text-text-primary shadow-lg cursor-pointer"
    >
      <FaSpotify className="text-[#1ed760]" size={15} />
      <span className="tabular-nums">{tr("pill", "Spotify → likes: {done} of {total}", { done: counts.done, total })}</span>
    </button>
  );
}
