import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CellphoneLine, ComputerLine, DeviceLine } from "@mingcute/react";
import { useTranslation } from "@/languages";
import { useModalStore } from "@/features/library/store/modalStore";
import { transferTo, useConnectStore, type ConnectDevice } from "../connectService";

function DeviceIcon({ kind, size = 18 }: { kind: ConnectDevice["kind"]; size?: number }) {
  return kind === "phone" ? <CellphoneLine size={size} /> : <ComputerLine size={size} />;
}

/** speaker-style button: lists linked devices and moves playback between them */
export default function ConnectDevicesButton({ className = "", size = 18 }: { className?: string; size?: number }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number }>({ left: 0 });
  const code = useConnectStore((s) => s.code);
  const me = useConnectStore((s) => s.me);
  const devices = useConnectStore((s) => s.devices);
  const followingId = useConnectStore((s) => s.followingId);
  const online = useConnectStore((s) => s.online);
  const others = Object.values(devices).sort((a, b) => a.name.localeCompare(b.name));
  const activeId = followingId ?? me.id;
  const tr = (key: string, fallback: string) => {
    const v = t(key);
    return v && v !== key ? v : fallback;
  };

  const toggle = () => {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) {
      const width = 260;
      const left = Math.min(Math.max(10, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 10);
      const below = rect.bottom + 12 + 280 < window.innerHeight;
      setPos(below ? { left, top: rect.bottom + 10 } : { left, bottom: window.innerHeight - rect.top + 10 });
    }
    setOpen((v) => !v);
  };

  const row = (device: ConnectDevice, isMe: boolean) => {
    const active = device.id === activeId;
    return (
      <button
        key={device.id}
        type="button"
        onClick={() => {
          if (!active) transferTo(device.id);
          setOpen(false);
        }}
        className={`flex w-full items-center gap-[12px] rounded-xl border-0 bg-transparent px-[12px] py-[10px] text-left cursor-pointer active:bg-border-alpha-14 hover:bg-border-alpha-14 ${
          active ? "text-accent-primary" : "text-text-primary"
        }`}
      >
        <DeviceIcon kind={device.kind} size={20} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-[500]">{device.name}</span>
          <span className="block truncate text-[12px] text-text-tertiary">
            {active ? tr("connect.playing_here", "Playing") : isMe ? tr("connect.this_device", "This device") : tr("connect.tap_to_play", "Tap to play here")}
          </span>
        </span>
      </button>
    );
  };

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={tr("connect.devices", "Devices")}
        title={tr("connect.devices", "Devices")}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        className={`${className} ${followingId ? "!text-accent-primary !opacity-100" : ""}`}
      >
        <DeviceLine size={size} />
      </button>
      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[300]" onClick={() => setOpen(false)} />
            <div
              className="fixed z-[301] w-[260px] overflow-hidden rounded-2xl border border-white/[0.08] p-[8px] shadow-[0_16px_48px_rgba(0,0,0,0.5)]"
              style={{
                ...pos,
                background: "color-mix(in srgb, var(--bg-elevated, #1a1a1e) 70%, transparent)",
                backdropFilter: "blur(28px) saturate(1.6)",
                WebkitBackdropFilter: "blur(28px) saturate(1.6)",
                fontFamily: "var(--font-inter), sans-serif",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="m-0 px-[12px] pb-[6px] pt-[4px] text-[12px] font-[600] uppercase tracking-[0.04em] text-text-tertiary">
                Lane Connect
              </p>
              {!code ? (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    useModalStore.getState().openSettings();
                  }}
                  className="w-full rounded-xl border-0 bg-border-alpha-14 px-[12px] py-[10px] text-left text-[13px] text-text-primary cursor-pointer"
                >
                  {tr("connect.setup_hint", "Link your devices in Settings ▸ Connect")}
                </button>
              ) : (
                <>
                  {row(me, true)}
                  {others.map((d) => row(d, false))}
                  {others.length === 0 && (
                    <p className="m-0 px-[12px] py-[8px] text-[12.5px] text-text-tertiary">
                      {online
                        ? tr("connect.no_devices", "No other devices online. Open Lane on another device with the same code.")
                        : tr("connect.offline", "Connecting…")}
                    </p>
                  )}
                </>
              )}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
