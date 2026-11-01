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
    <div className="flex min-w-0 w-full flex-col gap-[16px]">
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
              className="h-[36px] w-full min-w-0 max-w-[220px] rounded-[10px] border border-transparent bg-white/[0.06] px-[12px] text-[14px] text-text-primary outline-none transition-colors focus:border-white/[0.12] focus:bg-white/[0.08]"
            />
          }
        />
      </SettingSection>

      <SettingSection label={tr("connect.online_title", "Online now")}>
        {!channel ? (
          <span className="px-[16px] py-[10px] text-[13px] text-text-tertiary">
            {tr("connect.sign_in", "Sign in to the same account on your devices to switch playback between them.")}
          </span>
        ) : (
          <div className="flex min-w-0 flex-col gap-[3px] px-[8px] py-[6px]">
            {[me, ...Object.values(devices)].map((d) => {
              const active = d.id === activeId;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => !active && transferTo(d.id)}
                  aria-pressed={active}
                  className={`group flex min-h-[48px] w-full min-w-0 items-center gap-[10px] rounded-[10px] border-0 px-[8px] py-[7px] text-left transition-colors cursor-pointer ${
                    active
                      ? "bg-white/[0.07] text-text-primary"
                      : "bg-transparent text-text-primary"
                  }`}
                >
                  <span className={`inline-flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-[9px] ${active ? "bg-white/[0.09] text-text-primary" : "bg-white/[0.05] text-text-secondary"}`}>
                    {d.kind === "phone" ? <CellphoneLine size={17} /> : <ComputerLine size={17} />}
                  </span>
                  <span className="flex-1 truncate text-[13.5px] font-[500]">{d.name}</span>
                  {active ? (
                    <span className="inline-flex shrink-0 items-center gap-[6px] rounded-full bg-white/[0.08] px-[9px] py-[5px] text-[11px] font-[500] text-text-secondary">
                      <span className="h-[6px] w-[6px] rounded-full bg-emerald-400" />
                      {tr("connect.playing_here", "Playing")}
                    </span>
                  ) : d.id === me.id ? (
                    <span className="shrink-0 rounded-full bg-white/[0.05] px-[9px] py-[5px] text-[11px] text-text-tertiary">
                      {tr("connect.this_device", "This device")}
                    </span>
                  ) : null}
                </button>
              );
            })}
            {fingerprint && (
              <span className="inline-flex items-center gap-[6px] self-start px-[8px] pt-[4px] text-[11px] text-text-tertiary">
                <span className={`h-[6px] w-[6px] rounded-full ${online ? "bg-emerald-400" : "bg-text-tertiary"}`} />
                <span className="font-mono">{tr("connect.channel", "Channel")} {fingerprint}</span>
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
        <div className="flex min-w-0 flex-col gap-[10px] px-[16px] py-[10px]">
          <span className="min-w-0 text-[12.5px] leading-[1.5] text-text-tertiary">
            {tr("connect.code_hint", "If the devices don't find each other on their own: create a code on one and enter it on the other.")}
          </span>
          {code ? (
            <div className="flex flex-wrap items-center gap-[8px]">
              <span className="rounded-[10px] bg-white/[0.07] px-[12px] py-[8px] font-mono text-[14px] tracking-[0.06em] text-text-primary select-all">
                {code}
              </span>
              <Button variant="secondary" size="sm" className="!h-[34px] !rounded-[10px] !bg-white/[0.08] !text-text-primary hover:!bg-white/[0.12]" onClick={() => void navigator.clipboard?.writeText(code)}>
                {tr("connect.copy", "Copy")}
              </Button>
              <Button variant="secondary" size="sm" className="!h-[34px] !rounded-[10px] !bg-white/[0.08] !text-text-primary hover:!bg-white/[0.12]" onClick={() => applyCode(null)}>
                {tr("connect.use_account", "Use the account instead")}
              </Button>
            </div>
          ) : (
            <>
              <Button variant="secondary" size="sm" className="self-start !h-[34px] !rounded-[10px] !bg-white/[0.08] !text-text-primary hover:!bg-white/[0.12]" onClick={() => applyCode(generatePairingCode())}>
                {tr("connect.create", "Create code")}
              </Button>
            <div className="flex min-w-0 items-center gap-[8px]">
                <input
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    setBad(false);
                  }}
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  autoCapitalize="characters"
                  className="h-[38px] min-w-0 flex-1 rounded-[10px] border border-transparent bg-white/[0.06] px-[12px] font-mono text-[13px] tracking-[0.06em] text-text-primary outline-none transition-colors focus:border-white/[0.12] focus:bg-white/[0.08] placeholder:text-text-tertiary"
                />
                <Button
                  variant="secondary"
                  className="!h-[38px] !rounded-[10px] !bg-white/[0.08] !px-[16px] !text-text-primary hover:!bg-white/[0.12]"
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
