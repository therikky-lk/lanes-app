import { useState } from "react";
import { CellphoneLine, ComputerLine } from "@mingcute/react";
import { useTranslation } from "@/languages";
import { setDeviceName, transferTo, useConnectStore } from "@/features/connect/connectService";
import { SettingRow, SettingSection } from "../controls";

export function ConnectTab({ searchQuery }: { searchQuery?: string }) {
  const { t } = useTranslation();
  const tr = (key: string, fallback: string) => {
    const v = t(key);
    return v && v !== key ? v : fallback;
  };
  const code = useConnectStore((s) => s.code);
  const me = useConnectStore((s) => s.me);
  const devices = useConnectStore((s) => s.devices);
  const online = useConnectStore((s) => s.online);
  const followingId = useConnectStore((s) => s.followingId);
  const [name, setName] = useState(me.name);
  const activeId = followingId ?? me.id;

  return (
    <div className="flex flex-col gap-[16px]">
      <SettingSection>
        <SettingRow
          title={tr("connect.name_title", "Device name")}
          description={tr("connect.name_desc", "How this device shows up on your other devices.")}
          titleKey="connect.name_title"
          searchQuery={searchQuery}
          control={
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setDeviceName(name)}
              className="h-[36px] w-full max-w-[220px] rounded-[8px] border-0 bg-border-alpha-14 px-[12px] text-[14px] text-text-primary outline-none"
            />
          }
        />
      </SettingSection>

      <SettingSection label={tr("connect.online_title", "Online now")}>
        {!code ? (
          <span className="py-[10px] text-[13px] text-text-tertiary">
            {tr("connect.sign_in", "Sign in to the same account on your devices to switch playback between them.")}
          </span>
        ) : (
          <div className="flex flex-col py-[6px]">
            {[me, ...Object.values(devices)].map((d) => {
              const active = d.id === activeId;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => !active && transferTo(d.id)}
                  className={`flex items-center gap-[10px] rounded-lg border-0 bg-transparent px-[6px] py-[9px] text-left cursor-pointer hover:bg-border-alpha-14 ${active ? "text-accent-primary" : "text-text-primary"}`}
                >
                  {d.kind === "phone" ? <CellphoneLine size={18} /> : <ComputerLine size={18} />}
                  <span className="flex-1 truncate text-[14px]">{d.name}</span>
                  <span className="text-[12px] text-text-tertiary">
                    {active ? tr("connect.playing_here", "Playing") : d.id === me.id ? tr("connect.this_device", "This device") : ""}
                  </span>
                </button>
              );
            })}
            {Object.keys(devices).length === 0 && (
              <span className="px-[6px] py-[6px] text-[12.5px] text-text-tertiary">
                {online ? tr("connect.no_devices", "No other devices online.") : tr("connect.offline", "Connecting…")}
              </span>
            )}
          </div>
        )}
      </SettingSection>
    </div>
  );
}
