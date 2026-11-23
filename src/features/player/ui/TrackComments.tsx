import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { LuCheck, LuImagePlus, LuMessageCircle, LuSend, LuTrash2, LuX } from "react-icons/lu";
import { Link } from "react-router-dom";
import { animate, motion, useMotionValue, useReducedMotion } from "framer-motion";
import { useCoverSrc } from "@/features/covers";
import { useLocalAvatar } from "@/features/auth/store/localAvatarStore";
import { useTranslation } from "@/languages";
import { getAuthSession, getValidAccessToken } from "@/shared/api/auth-session";
import { LANE_LINK_ORIGIN } from "@/shared/api/baseUrl";
import { useIsMobile } from "@/shared/hooks/useIsMobile";
import type { Track } from "@/shared/types";
import type { SharedEntity } from "@/shared/contracts/sharing";
import { prepareCommentPhoto } from "./commentPhoto";

const MAX_LENGTH = 500;
type Comment = { id: number; author: string; text: string; createdAt: number; mine: boolean; avatar?: string; legacyAvatar?: boolean; hasPhoto?: boolean };
type Feed = { items: Comment[]; next: number | null };
type CommentError = "load" | "post" | "delete" | "rate" | "auth" | "photo";

export const supportsTrackComments = (id: string) => /^(?:[A-Za-z0-9_-]{11}|sc:\d{1,20}|au:[A-Za-z0-9_-]{1,64})$/.test(id) && !/^(?:daily-mix|mix-)/.test(id);

function account() {
  const session = getAuthSession();
  return session?.user?.id ? `${session.authBackend ?? "liner"}:${session.user.id}` : null;
}

function subscribe(listener: () => void) {
  window.addEventListener("auth:changed", listener);
  return () => window.removeEventListener("auth:changed", listener);
}

export function useTrackCommentsAccount() {
  return useSyncExternalStore(subscribe, account);
}

async function request<T>(trackId: string, owner: string, signal: AbortSignal, options: { before?: number; text?: string; photo?: string; deleteId?: number; resource?: { id: number; kind: "photo" | "profile" | "avatar" } } = {}): Promise<T> {
  const method = options.deleteId ? "DELETE" : options.text !== undefined ? "POST" : "GET";
  const token = await getValidAccessToken();
  if (!token || owner !== account()) throw new Error("auth");
  const query = new URLSearchParams();
  if (owner.startsWith("hyprr:")) query.set("backend", "hyprr");
  if (options.before) query.set("before", String(options.before));
  const suffix = options.resource ? `/${options.resource.id}/${options.resource.kind}` : options.deleteId ? `/${options.deleteId}` : "";
  const url = new URL(`/v1/track-comments/${trackId}${suffix}`, LANE_LINK_ORIGIN);
  url.search = query.toString();
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (method === "POST") headers["content-type"] = "application/json";
  const response = await fetch(url, {
    method, headers, credentials: "omit", cache: "no-store", redirect: "error",
    body: method === "POST" ? JSON.stringify({ text: options.text, photo: options.photo }) : undefined,
    signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
  });
  if (owner !== account()) throw new Error("auth");
  if (response.status === 429) throw new Error("rate");
  if (response.status === 401 || response.status === 403) throw new Error("auth");
  if (!response.ok) throw Object.assign(new Error("request failed"), { status: response.status });
  return response.json();
}

export function getTrackCommentProfile(trackId: string, id: number, owner: string, signal: AbortSignal) {
  if (!supportsTrackComments(trackId) || !Number.isSafeInteger(id) || id < 1) return Promise.reject(new Error("Invalid comment link"));
  return request<SharedEntity>(trackId, owner, signal, { resource: { id, kind: "profile" } });
}

export function TrackCommentsPanel({ track, onOpenProfile }: { track: Track; onOpenProfile?: () => void }) {
  const owner = useTrackCommentsAccount();
  return owner ? <Discussion key={`${track.id}:${owner}`} track={track} owner={owner} onOpenProfile={onOpenProfile} desktop /> : null;
}

export default function TrackComments({ track, onClose, onOpenProfile }: { track: Track; onClose: () => void; onOpenProfile?: () => void }) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const closeButton = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const y = useMotionValue("100%");
  const panOrigin = useRef(0);
  const reduceMotion = useReducedMotion();
  const slide = { duration: reduceMotion ? 0 : 0.26, ease: [0.22, 1, 0.36, 1] as const };
  useEffect(() => { if (!isMobile) closeButton.current?.focus({ preventScroll: true }); }, [isMobile]);

  if (!isMobile) return (
    <div className="absolute inset-x-0 bottom-0 top-[var(--lane-fs-chrome-height,36px)] z-50 flex justify-end overflow-hidden" data-no-sheet-drag>
      <motion.div className="absolute inset-0 bg-black/20" onClick={onClose} aria-hidden="true"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={slide} />
      <motion.div role="dialog" aria-modal="true" aria-labelledby="track-comments-title"
        initial={{ x: reduceMotion ? "0%" : "100%" }} animate={{ x: "0%" }} exit={{ x: "100%" }} transition={slide}
        className="relative flex h-full w-[min(100%,440px)] min-w-0 flex-col border-l border-white/10 bg-[#191b20] px-[18px] pb-4 pt-4 shadow-2xl"
        onKeyDown={event => {
          if (event.key === "Escape" && !event.nativeEvent.isComposing) { event.stopPropagation(); onClose(); }
        }}
      >
        <button ref={closeButton} type="button" aria-label={t("track_comments.close")} onClick={onClose}
          className="absolute right-[18px] top-3 z-10 grid size-8 place-items-center rounded-full border-0 bg-white/10 text-white hover:bg-white/20">
          <LuX size={17} />
        </button>
        <div className="flex min-h-0 flex-1">
          <SheetDiscussion track={track} onOpenProfile={onOpenProfile} />
        </div>
      </motion.div>
    </div>
  );

  return (
    <div className="absolute inset-0 z-50 flex items-end overflow-hidden" data-no-sheet-drag>
      <motion.div className="lane-sheet-dimmer absolute inset-0" aria-hidden="true"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={slide} />
      <motion.div ref={sheet} role="dialog" aria-modal="true" aria-labelledby="track-comments-title"
        initial={{ y: reduceMotion ? "0%" : "100%" }} animate={{ y: "0%" }} exit={{ y: "100%" }} transition={slide}
        style={{ y }} className="relative flex max-h-[calc(100%_-_var(--lane-safe-top,0px))] w-full flex-col overflow-hidden rounded-t-2xl border-t border-white/10 bg-[#191b20]/95 px-[18px] pb-[calc(var(--lane-safe-bottom,0px)+16px)] pt-2 will-change-transform"
      >
        <motion.div
          className="mx-auto mb-1 flex h-8 w-20 shrink-0 touch-none cursor-grab items-center justify-center rounded-full border-0 bg-transparent focus-visible:outline-2 focus-visible:outline-white/60 active:cursor-grabbing"
          onPanStart={() => {
            y.stop();
            panOrigin.current = parseFloat(y.get());
          }}
          onPan={(_, info) => {
            if (!reduceMotion && sheet.current?.offsetHeight) y.set(`${Math.max(0, panOrigin.current + info.offset.y / sheet.current.offsetHeight * 100)}%`);
          }}
          onPanEnd={(_, info) => {
            if (info.offset.y > 90 || (info.offset.y > 12 && info.velocity.y > 650)) onClose();
            else animate(y, "0%", slide);
          }}
        >
          <span className="h-1 w-9 rounded-full bg-white/35" />
        </motion.div>
        <div className="flex h-[min(520px,58dvh)] min-h-0">
          <SheetDiscussion track={track} onOpenProfile={onOpenProfile} />
        </div>
      </motion.div>
    </div>
  );
}

function CommentAvatar({ item, trackId, owner, locale }: { item: Comment; trackId: string; owner: string; locale: string }) {
  const user = item.mine ? getAuthSession()?.user : undefined;
  const ownAvatar = useLocalAvatar(user?.id, user?.avatarUrl);
  const [fallback, setFallback] = useState<string>();
  const [failed, setFailed] = useState<string[]>([]);
  const preferred = [ownAvatar, item.avatar].find(url => url && !failed.includes(url));
  useEffect(() => {
    if (preferred || !(item.mine || item.legacyAvatar || item.avatar)) return;
    const controller = new AbortController();
    void request<{ avatar: string }>(trackId, owner, controller.signal, { resource: { id: item.id, kind: "avatar" } })
      .then(result => { if (!controller.signal.aborted) setFallback(result.avatar); }).catch(() => {});
    return () => controller.abort();
  }, [item.id, item.mine, item.legacyAvatar, item.avatar, preferred, trackId, owner]);
  const avatar = preferred || (fallback && !failed.includes(fallback) ? fallback : undefined);
  return avatar
    ? <img className="size-full object-cover" src={avatar} alt="" referrerPolicy="no-referrer" onError={() => setFailed(previous => [...previous, avatar])} />
    : <span aria-hidden="true">{Array.from(item.author)[0]?.toLocaleUpperCase(locale)}</span>;
}

function CommentPhoto({ id, trackId, owner, onOpen }: { id: number; trackId: string; owner: string; onOpen: (src: string) => void }) {
  const { t } = useTranslation();
  const thumb = useRef<HTMLButtonElement>(null);
  const [src, setSrc] = useState<string>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const load = () => {
      void request<{ photo: string }>(trackId, owner, controller.signal, { resource: { id, kind: "photo" } })
        .then(result => { if (!controller.signal.aborted) setSrc(`data:image/jpeg;base64,${result.photo}`); })
        .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    };
    const observer = typeof IntersectionObserver !== "undefined" && thumb.current ? new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer?.disconnect(); load(); }
    }) : null;
    if (observer && thumb.current) observer.observe(thumb.current);
    else load();
    return () => { observer?.disconnect(); controller.abort(); };
  }, [id, trackId, owner]);
  return <button ref={thumb} type="button" disabled={!src} aria-label={t("track_comment_photo.open")}
    onClick={() => { if (src) onOpen(src); }} className="mt-2 grid aspect-square w-[min(100%,160px)] place-items-center overflow-hidden rounded-xl border-0 bg-current/10 p-0 text-inherit">
    {src ? <img src={src} alt="" className="size-full object-cover" /> : <span className="text-xs">{t(failed ? "track_comment_photo.error" : "track_comments.loading")}</span>}
  </button>;
}

function SheetDiscussion({ track, onOpenProfile }: { track: Track; onOpenProfile?: () => void }) {
  const owner = useTrackCommentsAccount();
  return owner ? <Discussion key={`${track.id}:${owner}`} track={track} owner={owner} onOpenProfile={onOpenProfile} /> : null;
}

function Discussion({ track, owner, desktop = false, onOpenProfile }: { track: Track; owner: string; desktop?: boolean; onOpenProfile?: () => void }) {
  const { t, locale } = useTranslation();
  const cover = useCoverSrc(track.coverUrl);
  const lifetime = useRef<AbortController | null>(null);
  const [feed, setFeed] = useState<Feed | null>(null);
  const [draft, setDraft] = useState("");
  const [photo, setPhoto] = useState<string>();
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const [enlarged, setEnlarged] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);
  const viewer = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<CommentError | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const errorText = error === "photo" ? t("track_comment_photo.error") : error ? t(`track_comments.${error}_error`) : "";

  useEffect(() => {
    const dialog = viewer.current;
    if (enlarged && dialog && !dialog.open) dialog.showModal();
  }, [enlarged]);

  async function choosePhoto(file?: File) {
    if (!file) return;
    setPreparingPhoto(true);
    setError(null);
    try { setPhoto(await prepareCommentPhoto(file)); }
    catch { setError("photo"); }
    finally { setPreparingPhoto(false); }
  }

  async function load(signal: AbortSignal, before?: number) {
    setLoading(true);
    setError(null);
    try {
      const result = await request<Feed>(track.id, owner, signal, { before });
      if (!signal.aborted) setFeed(previous => before && previous ? { ...result, items: [...previous.items, ...result.items] } : result);
    } catch (cause) {
      if (!signal.aborted) setError(cause instanceof Error && cause.message === "auth" ? "auth" : "load");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    void load(controller.signal);
    return () => controller.abort();
  }, [track.id, owner]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const signal = lifetime.current?.signal;
    if (!signal || (!draft.trim() && !photo) || preparingPhoto || busy || loading) return;
    setBusy(true);
    setError(null);
    try {
      const item = await request<Comment>(track.id, owner, signal, { text: draft.trim(), photo });
      if (signal.aborted) return;
      setDraft("");
      setPhoto(undefined);
      if (feed) setFeed({ ...feed, items: [item, ...feed.items] });
      else await load(signal);
    } catch (cause) {
      if (!signal.aborted) setError(cause instanceof Error && cause.message === "rate" ? "rate" : cause instanceof Error && cause.message === "auth" ? "auth" : "post");
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }

  async function remove(id: number) {
    const signal = lifetime.current?.signal;
    if (!signal || busy || loading) return;
    setBusy(true);
    setError(null);
    try {
      await request(track.id, owner, signal, { deleteId: id });
      if (signal.aborted) return;
      setFeed(previous => previous && { ...previous, items: previous.items.filter(item => item.id !== id) });
      setConfirmDelete(null);
    } catch {
      if (!signal.aborted) setError("delete");
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }

  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const tint = desktop ? "bg-bg-elevated" : "bg-white/10";
  const muted = desktop ? "text-text-secondary" : "text-white/65";
  const pill = `rounded-xl border-0 ${tint} px-3 py-2 text-sm font-medium text-inherit disabled:opacity-40`;
  return (
    <section className={`mx-auto flex min-h-0 w-full max-w-[620px] flex-col gap-3 ${desktop ? "text-text-primary" : "text-white"}`}>
      <header>
        <h2 id="track-comments-title" className="m-0 text-lg font-semibold">{t("track_comments.title")}</h2>
      </header>
      <div className={`flex min-w-0 items-center gap-3 rounded-xl p-2 ${tint}`}>
        <div className={`grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg ${tint}`}>{cover ? <img src={cover} alt="" className="size-full object-cover" /> : <LuMessageCircle size={18} />}</div>
        <div className="min-w-0"><div className="truncate text-sm font-semibold">{track.title}</div><div className={`truncate text-xs ${muted}`}>{track.artists}</div></div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" aria-busy={loading}>
        {!feed && loading && <p role="status" className={`py-6 text-center text-sm ${muted}`}>{t("track_comments.loading")}</p>}
        {feed?.items.length === 0 && !feed.next && (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <LuMessageCircle size={24} className={muted} />
            <strong className="text-sm">{t("track_comments.empty")}</strong>
            <span className={`text-xs ${muted}`}>{t("track_comments.empty_hint")}</span>
          </div>
        )}
        {feed && feed.items.length > 0 && <ul className={`m-0 list-none divide-y p-0 ${desktop ? "divide-border-secondary" : "divide-white/10"}`}>
          {feed.items.map(item => {
            const profile = `/user?${new URLSearchParams({ commentTrack: track.id, comment: String(item.id) })}`;
            const confirming = confirmDelete === item.id;
            return (
            <li key={item.id} className="flex items-start gap-3 py-3">
              <Link to={profile} onClick={onOpenProfile} aria-label={item.author} className={`grid size-8 shrink-0 place-items-center overflow-hidden rounded-full text-xs font-semibold text-inherit no-underline ${tint}`}><CommentAvatar item={item} trackId={track.id} owner={owner} locale={locale} /></Link>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2"><Link to={profile} onClick={onOpenProfile} className="max-w-full break-all text-sm font-semibold text-inherit no-underline hover:underline">{item.author}</Link><time className={`text-xs ${muted}`} dateTime={new Date(item.createdAt).toISOString()}>{date.format(item.createdAt)}</time></div>
                {item.text && <p className="m-0 mt-1 whitespace-pre-wrap wrap-anywhere text-sm">{item.text}</p>}
                {item.hasPhoto && <CommentPhoto id={item.id} trackId={track.id} owner={owner} onOpen={setEnlarged} />}
              </div>
              {item.mine && <div className="relative shrink-0">
                <button type="button" className={`${pill} !p-2`} disabled={busy || loading} aria-label={t("track_comments.delete")} aria-pressed={confirming}
                  onClick={() => confirming ? void remove(item.id) : setConfirmDelete(item.id)}>{confirming ? <LuCheck size={16} /> : <LuTrash2 size={16} />}</button>
                {confirming && <button type="button" className={`${pill} absolute right-full mr-1 !p-2`} disabled={busy} aria-label={t("track_comments.cancel")} onClick={() => setConfirmDelete(null)}><LuX size={16} /></button>}
              </div>}
            </li>
            );
          })}
        </ul>}
        {(feed?.next || (!feed && error === "load")) && <button type="button" className={`${pill} my-2 w-full`} disabled={loading || busy} onClick={() => {
          const signal = lifetime.current?.signal;
          if (signal) void load(signal, feed?.next ?? undefined);
        }}>{loading ? t("track_comments.loading") : t(feed?.next ? "track_comments.more" : "track_comments.retry")}</button>}
      </div>
      {errorText && <p role="alert" className={`m-0 text-xs ${desktop ? "text-text-primary" : "text-red-200"}`}>{errorText}</p>}
        {photo && <div className="relative w-fit">
          <button type="button" className="block size-14 overflow-hidden rounded-lg border-0 p-0" aria-label={t("track_comment_photo.open")} onClick={() => setEnlarged(`data:image/jpeg;base64,${photo}`)}><img className="size-full object-cover" src={`data:image/jpeg;base64,${photo}`} alt="" /></button>
          <button type="button" className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full border-0 bg-black text-white" disabled={busy} aria-label={t("common.remove")} onClick={() => setPhoto(undefined)}><LuX size={14} /></button>
        </div>}
        <form className="grid grid-cols-[40px_minmax(0,1fr)_48px] grid-rows-[48px_auto] items-stretch gap-x-2 gap-y-1" onSubmit={submit}>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" hidden onChange={event => { void choosePhoto(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
          <button type="button" className={`${pill} grid place-items-center !p-0`} aria-label={t("track_comment_photo.add")} disabled={busy || preparingPhoto} onClick={() => fileInput.current?.click()}><LuImagePlus size={18} /></button>
          <textarea rows={1} maxLength={MAX_LENGTH} value={draft} onChange={event => setDraft(event.target.value)} readOnly={busy} placeholder={t("track_comments_input")} aria-label={t("track_comments_input")} className={`box-border min-h-0 min-w-0 resize-none rounded-xl border px-3 py-[11px] text-base leading-6 text-inherit outline-none ${desktop ? "border-border-secondary bg-bg-elevated placeholder:text-text-secondary focus:border-accent-primary" : "border-white/10 bg-white/10 placeholder:text-white/55 focus:border-white/45"}`} />
          <button type="submit" aria-label={t("track_comments.send")} disabled={(!draft.trim() && !photo) || preparingPhoto || busy || loading || error === "auth"} className={`grid place-items-center rounded-xl border-0 p-0 disabled:opacity-35 ${desktop ? "bg-text-primary text-bg-primary" : "bg-white text-black"}`}><LuSend size={18} /></button>
          <span className={`col-start-2 px-1 text-right text-[11px] tabular-nums ${muted}`}>{draft.length}/{MAX_LENGTH}</span>
        </form>
        <dialog ref={viewer} aria-label={t("track_comment_photo.open")} onClose={() => setEnlarged(undefined)}
          onKeyDown={event => { if (event.key === "Escape") event.stopPropagation(); }}
          onClick={event => { if (event.target === event.currentTarget) viewer.current?.close(); }}
          className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-black p-0 text-white backdrop:bg-black">
          <button type="button" aria-label={t("common.close")} className="absolute right-4 top-[calc(var(--lane-safe-top,0px)+12px)] z-10 border-0 bg-transparent p-2 text-white" onClick={() => viewer.current?.close()}><LuX size={24} /></button>
          {enlarged && <img src={enlarged} alt="" className="pointer-events-none size-full object-contain" />}
        </dialog>
    </section>
  );
}
