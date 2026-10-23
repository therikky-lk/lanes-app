import { useState } from "react";
import { CellphoneLine, ComputerLine } from "@mingcute/react";
import { useTranslation } from "@/languages";
import { manualCode, setDeviceName, setManualCode, transferTo, useConnectStore } from "@/features/connect/connectService";
import { generatePairingCode, normalizePairingCode } from "@/features/connect/connectCrypto";
import Button from "@/shared/ui/Button";
import { SettingRow, SettingSection } from "../controls";

export function ConnectTab({ searchQuery }: { searchQuery?: string }) {
  const { t } = useTranslation();
  const tr = (key: string, fallback: string) => {
    const v = t(key);
    return v && v !== key ? v : fallback;
  };
  const channel = useConnectStore((s) => s.code);
  const me = useConnectStore((s) => s.me);
  const devices = useConnectStore((s) => s.devices);
  const online = useConnectStore((s) => s.online);
  const followingId = useConnectStore((s) => s.followingId);
  const fingerprint = useConnectStore((s) => s.fingerprint);
  const [name, setName] = useState(me.name);
  const [code, setCodeState] = useState<string | null>(() => manualCode());
  const [input, setInput] = useState("");
  const [bad, setBad] = useState(false);
  const applyCode = (value: string | null) => {
    setCodeState(value);
    void setManualCode(value);
  };
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
        {!channel ? (
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
            {fingerprint && (
              <span className="px-[6px] pt-[4px] text-[11px] text-text-tertiary">
                {online ? "●" : "○"} channel {fingerprint}
              </span>
            )}
            {Object.keys(devices).length === 0 && (
              <span className="px-[6px] py-[6px] text-[12.5px] text-text-tertiary">
                {online ? tr("connect.no_devices", "No other devices online.") : tr("connect.offline", "Connecting…")}
              </span>
            )}
          </div>
        )}
      </SettingSection>

      <SettingSection label={tr("connect.code_section", "Pair by code")}>
        <div className="flex flex-col gap-[8px] py-[10px]">
          <span className="text-[12.5px] text-text-tertiary">
            {tr("connect.code_hint", "If the devices don't find each other on their own: create a code on one and enter it on the other.")}
          </span>
          {code ? (
            <div className="flex flex-wrap items-center gap-[8px]">
              <span className="rounded-[8px] bg-border-alpha-14 px-[10px] py-[7px] font-mono text-[14px] tracking-[0.06em] text-text-primary select-all">
                {code}
              </span>
              <Button variant="secondary" size="sm" onClick={() => void navigator.clipboard?.writeText(code)}>
                {tr("connect.copy", "Copy")}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => applyCode(null)}>
                {tr("connect.use_account", "Use the account instead")}
              </Button>
            </div>
          ) : (
            <>
              <Button variant="secondary" size="sm" className="self-start" onClick={() => applyCode(generatePairingCode())}>
                {tr("connect.create", "Create code")}
              </Button>
              <div className="flex items-center gap-[8px]">
                <input
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    setBad(false);
                  }}
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  autoCapitalize="characters"
                  className="h-[36px] w-full rounded-[8px] border-0 bg-border-alpha-14 px-[12px] font-mono text-[14px] tracking-[0.06em] text-text-primary outline-none placeholder:text-text-tertiary"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const normalized = normalizePairingCode(input);
                    if (!normalized) setBad(true);
                    else applyCode(normalized);
                  }}
                >
                  {tr("connect.join", "Link")}
                </Button>
              </div>
              {bad && <span className="text-[12px] text-[#E5484D]">{tr("connect.bad_code", "That code doesn't look right")}</span>}
            </>
          )}
        </div>
      </SettingSection>
    </div>
  );
}
