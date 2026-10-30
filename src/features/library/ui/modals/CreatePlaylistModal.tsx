import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import Button from "@/shared/ui/Button";
import TextInput from "@/shared/ui/TextInput";
import Tooltip from "@/shared/ui/Tooltip";
import { CheckLine, CloseLine, InformationLine, LinkLine, Upload2Line } from "@mingcute/react";
import { useAddPlaylistTracks, useCreatePlaylist } from "../../hooks";
import { notifyLibraryChanged } from "../../hooks/usePlaylists";
import Dialog from "@/shared/ui/Dialog";
import { useToast } from "@/shared/ui";
import { useTranslation } from "@/languages";
import { useModalStore } from "../../store/modalStore";
import { useImportStore } from "../../store/importStore";
import { resolveApiErrorMessage } from "@/shared/api";
import { imageFileToCover, setPlaylistCover } from "../../services/playlistCovers";

type Tab = "create" | "import";

const TITLE_MAX = 50;

// mirrors backend detectImportSource, labels only
function detectSourceLabel(raw: string): string | null {
  try {
    let text = raw.trim();
    if (!text.startsWith("http://") && !text.startsWith("https://")) {
      text = `https://${text}`;
    }
    const host = new URL(text).hostname.toLowerCase().replace(/^www\./, "");
    if (["youtube.com", "music.youtube.com", "m.youtube.com", "youtu.be"].includes(host)) return "YouTube";
    if (host === "soundcloud.com" || host.endsWith(".soundcloud.com")) return "SoundCloud";
    if (host === "open.spotify.com") return "Spotify";
    if (host === "deezer.com" || host.endsWith(".deezer.com")) return "Deezer";
    if (["music.apple.com", "geo.music.apple.com", "itunes.apple.com"].includes(host) || host.endsWith(".music.apple.com")) return "Apple Music";
  } catch {
    // not a url yet
  }
  return null;
}

const font = { fontFamily: "var(--font-inter), sans-serif" } as const;

export default function CreatePlaylistModal() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const open = useModalStore((state) => state.createPlaylistOpen);
  const initialUrl = useModalStore((state) => state.createPlaylistInitialUrl);
  const pendingTrack = useModalStore((state) => state.createPlaylistPendingTrack);
  const close = useModalStore((state) => state.closeCreatePlaylist);

  const [tab, setTab] = useState<Tab>("create");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [cover, setCover] = useState<string | null>(null);
  const [importUrl, setImportUrl] = useState("");

  const [importing, setImporting] = useState(false);
  const [createError, setCreateError] = useState("");
  const [importError, setImportError] = useState("");

  const titleRef = useRef<HTMLInputElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const createPlaylist = useCreatePlaylist();
  const addTrack = useAddPlaylistTracks();

  const detectedSource = detectSourceLabel(importUrl);
  const isCreate = tab === "create";

  useEffect(() => {
    if (open) {
      setTab(initialUrl ? "import" : "create");
      setTitle("");
      setDescription("");
      setCover(null);
      setImportUrl((initialUrl || "").trim());
      setCreateError("");
      setImportError("");
      requestAnimationFrame(() =>
        (initialUrl ? linkRef : titleRef).current?.focus(),
      );
    }
  }, [open, initialUrl]);

  async function handleCreate() {
    if (createPlaylist.isPending) return;
    const trimmed = title.trim();
    if (!trimmed) {
      setCreateError(t("common.name_required"));
      return;
    }
    setCreateError("");
    try {
      const playlist = await createPlaylist.mutateAsync({
        title: trimmed.slice(0, TITLE_MAX),
        description: description.trim() || undefined,
      });
      if (cover) {
        try {
          setPlaylistCover(playlist.id, cover, { notify: false });
        } catch {
          // The playlist is already created; a storage failure must not undo it.
        }
      }
      notifyLibraryChanged();

      if (pendingTrack) {
        try {
          await addTrack.mutateAsync({ playlistId: playlist.id, trackId: pendingTrack.id });
          toast(t("common.added_to_playlist"), "checkmark", {
            description: playlist.title || trimmed,
          });
        } catch {
          toast(t("common.failed_add_playlist"), "error");
        }
      }

      close();
    } catch {
      setCreateError(t("common.failed_create_playlist"));
    }
  }

  async function handleCoverChange(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    try {
      setCover(await imageFileToCover(file));
    } catch {
      setCreateError(t("common.failed_create_playlist"));
    }
  }

  async function handleImport(overrideUrl?: string) {
    if (importing) return;
    let target = (overrideUrl ?? importUrl).trim();
    if (!target) {
      setImportError(t("common.paste_link_first"));
      return;
    }

    if (!target.startsWith("http://") && !target.startsWith("https://")) {
      target = `https://${target}`;
    }

    try {
      new URL(target);
    } catch {
      setImportError(t("common.unsupported_link"));
      return;
    }

    setImportError("");
    setImporting(true);
    try {
      await useImportStore.getState().startImport(target, pendingTrack);
      close();
    } catch (err: unknown) {
      setImportError(resolveApiErrorMessage(err, t, "common.failed_import_playlist"));
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? close() : undefined)} maxWidth={440}>
      <div className="flex flex-col gap-[14px] px-[20px] pb-[16px]">
        <div className="flex items-start justify-between gap-[12px]">
          <div>
            <h2 className="m-0 text-[18px] font-[500] text-text-primary" style={font}>
              {isCreate ? t("library.create_playlist") : t("common.import_playlist")}
            </h2>
            <p className="m-0 mt-[2px] text-[13px] text-text-tertiary" style={font}>
              {isCreate ? t("common.create_empty_playlist") : t("common.import_playlist_description")}
            </p>
          </div>
          <button
            type="button"
            aria-label={t("common.close")}
            onClick={close}
            className="inline-flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-md border-0 bg-transparent text-text-secondary transition-colors hover:bg-border-alpha-14 hover:text-text-primary cursor-pointer"
          >
            <CloseLine size={18} />
          </button>
        </div>

        <div className="inline-flex items-center gap-[4px] rounded-xl p-[4px] bg-border-alpha-14">
          {(
            [
              { id: "create", label: t("library.create_playlist") },
              { id: "import", label: t("common.import") },
            ] as const
          ).map((item) => (
            <motion.button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              whileTap={{ scale: 0.96 }}
              transition={{ type: "spring", stiffness: 450, damping: 32 }}
              className={`relative inline-flex min-w-[160px] flex-1 items-center justify-center rounded-lg px-[16px] py-[7px] text-[13px] leading-none font-[500] transition-colors duration-150 cursor-pointer border-none ${
                tab === item.id
                  ? "text-text-primary"
                  : "bg-transparent text-text-secondary hover:text-text-primary"
              }`}
              style={font}
            >
              {tab === item.id && (
                <motion.span
                  layoutId="createPlaylistModalTab"
                  className="absolute inset-0 rounded-lg bg-bg-primary"
                  transition={{ type: "spring", stiffness: 450, damping: 35 }}
                />
              )}
              <span className="relative z-10">{item.label}</span>
            </motion.button>
          ))}
        </div>

        {isCreate ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleCreate();
            }}
            className="flex flex-col gap-[10px]"
          >
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                void handleCoverChange(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              className="flex w-full items-center gap-[12px] border-0 bg-transparent p-0 text-left cursor-pointer"
              aria-label={t("common.choose_cover")}
            >
              <span
                aria-hidden="true"
                className="relative inline-flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border-primary bg-bg-primary text-text-tertiary"
              >
                {cover ? (
                  <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <Upload2Line size={22} />
                )}
              </span>
              <div className="min-w-0">
                <p className="m-0 text-[13px] text-text-primary" style={font}>{t("common.playlist_cover")}</p>
                <span className="mt-[3px] block text-[12px] text-text-tertiary" style={font}>
                  {t("common.choose_cover")}
                </span>
              </div>
            </button>
            <TextInput
              ref={titleRef}
              placeholder={t("common.playlist_name")}
              value={title}
              maxLength={TITLE_MAX}
              hasError={Boolean(createError)}
              onChange={(e) => {
                setTitle(e.target.value);
                if (createError) setCreateError("");
              }}
              disabled={createPlaylist.isPending}
              className="cursor-pointer [&_input]:cursor-pointer"
              rightSlot={
                <span className="text-[11px] text-text-tertiary tabular-nums" style={font}>
                  {title.length}/{TITLE_MAX}
                </span>
              }
            />
            <textarea
              placeholder={t("common.description_placeholder")}
              value={description}
              maxLength={300}
              rows={2}
              disabled={createPlaylist.isPending}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full cursor-pointer resize-none rounded-md border border-border-primary bg-bg-primary px-[14px] py-[10px] text-[14px] font-[400] text-text-primary placeholder:text-text-tertiary outline-none transition-[border-color,box-shadow] duration-150 focus:border-text-secondary focus:ring-1 focus:ring-text-secondary disabled:opacity-50"
              style={font}
            />
            {createError && (
              <span className="text-[12px] text-accent-primary" style={font}>
                {createError}
              </span>
            )}
            <div className="flex items-center justify-end gap-[8px] mt-[2px]">
              <Button type="submit" variant="primary" size="sm" disabled={createPlaylist.isPending}>
                {createPlaylist.isPending ? t("common.adding") : t("common.create")}
              </Button>
            </div>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleImport();
            }}
            className="flex flex-col gap-[10px]"
          >
            <TextInput
              ref={linkRef}
              icon={<LinkLine size={16} />}
              placeholder={t("common.paste_link_placeholder")}
              value={importUrl}
              hasError={Boolean(importError)}
              onChange={(e) => {
                setImportUrl(e.target.value);
                if (importError) setImportError("");
              }}
              disabled={importing}
              rightSlot={
                detectedSource ? (
                  <Tooltip content={detectedSource} side="top">
                    <span className="inline-flex cursor-help">
                      <CheckLine size={16} className="text-accent-primary" />
                    </span>
                  </Tooltip>
                ) : (
                  <Tooltip
                    side="top"
                    multiline
                    content={t("common.import_sources_hint")}
                  >
                    <span className="inline-flex text-text-tertiary hover:text-text-secondary transition-colors cursor-help">
                      <InformationLine size={16} />
                    </span>
                  </Tooltip>
                )
              }
            />
            {importError && (
              <span className="text-[12px] text-accent-primary" style={font}>
                {importError}
              </span>
            )}
            <div className="flex items-center justify-end gap-[8px] mt-[2px]">
              <Button type="submit" variant="primary" size="sm" disabled={importing}>
                {importing ? t("common.importing") : t("common.import")}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Dialog>
  );
}
