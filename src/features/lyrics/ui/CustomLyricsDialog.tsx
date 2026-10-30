import { useEffect, useRef, useState } from "react";
import Dialog from "@/shared/ui/Dialog";
import Button from "@/shared/ui/Button";
import { useToast } from "@/shared/ui";
import { useTranslation } from "@/languages";
import { detectLyricsFormat, getCustomLyrics, setCustomLyrics } from "@/shared/media/lyrics/customLyrics";
import { CloseLine } from "@mingcute/react";

export interface CustomLyricsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trackId: string | null;
  trackTitle?: string;
}

const font = { fontFamily: "var(--font-inter), sans-serif" };

/** paste or load an .lrc / .txt to give any track its own lyrics */
export default function CustomLyricsDialog({ open, onOpenChange, trackId, trackTitle }: CustomLyricsDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const existing = open ? getCustomLyrics(trackId) : null;

  useEffect(() => {
    if (open) setText(getCustomLyrics(trackId)?.content ?? "");
  }, [open, trackId]);

  useEffect(() => {
    const textarea = textAreaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const maxHeight = Math.floor(window.innerHeight * 0.55);
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [text, open]);

  const format = text.trim() ? detectLyricsFormat(text) : null;

  const save = () => {
    if (!trackId) return;
    setCustomLyrics(trackId, text);
    toast(text.trim() ? t("player.custom_lyrics_saved") || "Lyrics saved" : t("player.custom_lyrics_removed") || "Lyrics removed", "checkmark");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} maxWidth={560}>
      <div className="flex flex-col gap-[12px] px-[20px] pb-[16px]" style={font}>
        <div className="flex items-start justify-between gap-[12px]">
          <div className="min-w-0">
          <h2 className="m-0 text-[18px] font-[500] text-text-primary">{t("player.custom_lyrics_title") || "Your lyrics"}</h2>
          <p className="m-0 mt-[2px] text-[13px] text-text-tertiary">
            {trackTitle ? `${trackTitle} · ` : ""}
            {t("player.custom_lyrics_hint") || "Paste LRC with [mm:ss.xx] timestamps for synced lyrics, or plain text."}
          </p>
          </div>
          <button
            type="button"
            aria-label={t("common.close") || "Close"}
            onClick={() => onOpenChange(false)}
            className="inline-flex h-[32px] w-[32px] shrink-0 items-center justify-center border-0 bg-transparent p-0 text-text-tertiary cursor-pointer"
          >
            <CloseLine size={17} />
          </button>
        </div>

        <textarea
          ref={textAreaRef}
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={1}
          spellCheck={false}
          placeholder={"[00:12.40] First line\n[00:16.10] Second line\n\n…or just the words"}
          className="w-full min-h-[80px] max-h-[55vh] resize-none overflow-hidden rounded-xl border border-white/10 bg-bg-primary px-[14px] py-[10px] font-mono text-[13px] leading-[1.6] text-text-primary placeholder:text-text-tertiary outline-none transition-[border-color,box-shadow] duration-150 focus:border-white/25 focus:ring-1 focus:ring-white/10"
        />

        <div className="flex flex-wrap items-center gap-[8px]">
          <input
            ref={fileRef}
            type="file"
            accept=".lrc,.txt,text/plain"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) setText(await file.text());
            }}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            {t("player.custom_lyrics_load_file") || "Load .lrc file"}
          </Button>
          {format && (
            <span className="inline-flex h-[24px] items-center rounded-md bg-border-alpha-14 px-[8px] text-[12px] text-text-secondary">
              {format === "lrc" ? t("player.custom_lyrics_synced") || "Synced (LRC)" : t("player.custom_lyrics_plain") || "Plain text"}
            </span>
          )}
          <div className="flex-1" />
          {existing && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setText("");
                if (trackId) setCustomLyrics(trackId, "");
                onOpenChange(false);
              }}
            >
              {t("player.custom_lyrics_delete") || "Remove"}
            </Button>
          )}
          <Button type="button" variant="primary" size="sm" disabled={!trackId} onClick={save}>
            {t("player.save") || "Save"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
