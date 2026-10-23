import { useState } from "react";
import { CellphoneLine, ComputerLine } from "@mingcute/react";
import Button from "@/shared/ui/Button";
import { useTranslation } from "@/languages";
import { generatePairingCode, normalizePairingCode } from "@/features/connect/connectCrypto";
import { setDeviceName, setPairingCode, useConnectStore } from "@/features/connect/connectService";
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
  const [input, setInput] = useState("");
  const [bad, setBad] = useState(false);
  const [name, setName] = useState(me.name);
  const [copied, setCopied] = useState(false);
  const inputClass =
    "h-[36px] w-full rounded-[8px] border-0 bg-border-alpha-14 px-[12px] text-[14px] text-text-primary outline-none placeholder:text-text-tertiary";

  return (
    <div className="flex flex-col gap-[16px]">
      <SettingSection>
        <SettingRow
          title={tr("connect.code_title", "Pairing code")}
          description={tr("connect.code_desc", "Use the same code on all your devices.")}
          titleKey="connect.code_title"
          searchQuery={searchQuery}
          control={
            code ? (
              <div className="flex items-center gap-[8px]">
                <span className="rounded-[8px] bg-border-alpha-14 px-[10px] py-[7px] font-mono text-[14px] tracking-[0.06em] text-text-primary select-all">
                  {code}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard?.writeText(code).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    });
                  }}
                >
                  {copied ? tr("connect.copied", "Copied") : tr("connect.copy", "Copy")}
                </Button>
              </div>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => void setPairingCode(generatePairingCode())}>
                {tr("connect.create", "Create code")}
              </Button>
            )
          }
        />
        {!code && (
          <div className="flex flex-col gap-[8px] py-[13px]">
            <span className="text-[13px] text-text-secondary">{tr("connect.enter_code", "Enter a code from another device")}</span>
            <div className="flex items-center gap-[8px]">
              <input
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setBad(false);
                }}
                placeholder="XXXX-XXXX-XXXX-XXXX"
                autoCapitalize="characters"
                className={`${inputClass} font-mono tracking-[0.06em]`}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const normalized = normalizePairingCode(input);
                  if (!normalized) {
                    setBad(true);
                    return;
                  }
                  void setPairingCode(normalized);
                }}
              >
                {tr("connect.join", "Link")}
              </Button>
            </div>
            {bad && <span className="text-[12px] text-[#E5484D]">{tr("connect.bad_code", "That code doesn't look right")}</span>}
          </div>
        )}
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
              className={`${inputClass} max-w-[220px]`}
            />
          }
        />
      </SettingSection>

      {code && (
        <SettingSection label={tr("connect.online_title", "Online now")}>
          <div className="flex flex-col py-[6px]">
            {[me, ...Object.values(devices)].map((d) => (
              <div key={d.id} className="flex items-center gap-[10px] py-[8px] text-text-primary">
                {d.kind === "phone" ? <CellphoneLine size={18} /> : <ComputerLine size={18} />}
                <span className="flex-1 truncate text-[14px]">{d.name}</span>
                {d.id === me.id && <span className="text-[12px] text-text-tertiary">{tr("connect.this_device", "This device")}</span>}
              </div>
            ))}
            {Object.keys(devices).length === 0 && (
              <span className="py-[6px] text-[12.5px] text-text-tertiary">
                {online ? tr("connect.no_devices", "No other devices online.") : tr("connect.offline", "Connecting…")}
              </span>
            )}
          </div>
          <div className="py-[10px]">
            <Button variant="secondary" size="sm" onClick={() => void setPairingCode(null)}>
              {tr("connect.unlink", "Unlink this device")}
            </Button>
          </div>
        </SettingSection>
      )}
    </div>
  );
}
