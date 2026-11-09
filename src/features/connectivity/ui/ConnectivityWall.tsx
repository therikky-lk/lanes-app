import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { WifiOffLine, CopyLine, DownloadLine, CloseLine, DownLine } from "@mingcute/react";
import Button from "@/shared/ui/Button";
import { useTranslation } from "@/languages";
import { useToast } from "@/shared/ui";
import { dismissToast } from "@/shared/ui/Toast";
import { useConnectivityStore } from "../store/connectivityStore";
import type { DiagCheck } from "../lib/diagnostics";
import { DIAG_ENDPOINTS } from "../lib/diagnostics";
import { buildOfflineDump, copyDump, downloadDump } from "../lib/dump";
import { isLikelyNetworkRestriction, isServerOutage } from "../lib/failureKind";


function StatusDot({ status }: { status: DiagCheck["status"] }) {
  const color =
    status === "ok"
      ? "bg-emerald-400"
      : status === "fail"
        ? "bg-red-400"
        : "bg-text-tertiary";
  return <span className={`mt-[5px] h-[8px] w-[8px] shrink-0 rounded-full ${color}`} />;
}

export default function ConnectivityWall() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [showChecks, setShowChecks] = useState(false);
  const visible = useConnectivityStore((s) => s.visible);
  const running = useConnectivityStore((s) => s.running);
  const checks = useConnectivityStore((s) => s.checks);
  const failures = useConnectivityStore((s) => s.failures);
  const main = useConnectivityStore((s) => s.main);
  const lastRunAt = useConnectivityStore((s) => s.lastRunAt);
  const retry = useConnectivityStore((s) => s.retry);
  const reset = useConnectivityStore((s) => s.reset);
  const runDiagnostics = useConnectivityStore((s) => s.runDiagnostics);

  useEffect(() => {
    if (!visible) return;
    dismissToast("network-timeout-toast");
    dismissToast("network-error-toast");
  }, [visible]);

  const dump = useMemo(
    () =>
      buildOfflineDump({
        checks,
        failures,
        main,
        endpoints: DIAG_ENDPOINTS,
      }),
    [checks, failures, main],
  );

  if (!visible) return null;

  const okCount = checks.filter((c) => c.status === "ok").length;
  const serverOutage = isServerOutage(checks);
  const likelyNetworkRestriction = !serverOutage && isLikelyNetworkRestriction(checks);
  const steps = [
    t("connectivity.step_net"),
    t("connectivity.step_vpn"),
    t("connectivity.step_firewall"),
    t("connectivity.step_router"),
  ];

  const checkLabel = (check: DiagCheck): string => {
    const base = t(`connectivity.check_${check.id}`);
    return check.host ? `${base} · ${check.host}` : base;
  };

  const handleCopy = async () => {
    const done = await copyDump(dump);
    toast(
      done ? t("connectivity.dump_copied") : t("connectivity.dump_copy_failed"),
      done ? "info" : "error",
    );
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/35 p-[16px] backdrop-blur-2xl sm:p-[24px]">
      <div className="relative flex max-h-[calc(100dvh-32px)] w-full max-w-[520px] flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-bg-panel/70 p-[20px] shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl sm:max-h-[calc(100dvh-48px)] sm:p-[28px]">
        <button
          type="button"
          onClick={reset}
          aria-label={t("common.close") || "Close"}
          className="absolute right-4 top-4 flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg bg-transparent text-text-tertiary hover:text-text-primary transition-colors border-0"
        >
          <CloseLine size={18} />
        </button>
        <div className="flex items-center gap-[12px]">
          <span className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-400">
            <WifiOffLine size={20} />
          </span>
          <div className="min-w-0">
            <h1
              className="m-0 text-[18px] font-[600] tracking-[-0.01em] text-text-primary"
              style={{ fontFamily: "var(--font-inter), sans-serif" }}
            >
              {t(serverOutage
                ? "connectivity.wall_title_server"
                : likelyNetworkRestriction
                  ? "connectivity.wall_title_vpn"
                  : "connectivity.wall_title")}
            </h1>
            <p
              className="m-0 mt-[2px] text-[13px] text-text-secondary"
              style={{ fontFamily: "var(--font-inter), sans-serif" }}
            >
              {t(serverOutage
                ? "connectivity.wall_subtitle_server"
                : likelyNetworkRestriction
                  ? "connectivity.wall_subtitle_vpn"
                  : "connectivity.wall_subtitle")}
            </p>
          </div>
        </div>

        <div className="mt-[16px] min-h-0 flex-1 overflow-y-auto">
          <p
            className="m-0 text-[13px] font-[600] text-text-primary"
            style={{ fontFamily: "var(--font-inter), sans-serif" }}
          >
            {t("connectivity.steps_title")}
          </p>
          <ol
            className="m-0 mt-[8px] flex flex-col gap-[6px] pl-[20px] text-[13px] leading-[1.5] text-text-secondary"
            style={{ fontFamily: "var(--font-inter), sans-serif" }}
          >
            {steps.map((step) => (
              <li key={step} className="m-0">
                {step}
              </li>
            ))}
          </ol>

          <button
            type="button"
            aria-expanded={showChecks}
            aria-controls="connectivity-check-details"
            onClick={() => {
              setShowChecks((prev) => !prev);
              if (checks.length === 0) void runDiagnostics();
            }}
            className="mt-[16px] flex w-full items-center gap-[10px] rounded-lg bg-bg-elevated px-[12px] py-[10px] text-left text-[13px] font-[500] text-text-primary transition-colors hover:bg-bg-panel cursor-pointer border-0"
            style={{ fontFamily: "var(--font-inter), sans-serif" }}
          >
            <span className="min-w-0 flex-1">
              {running
                ? t("connectivity.retrying")
                : checks.length > 0
                  ? t("connectivity.check_ok_count", { ok: okCount, total: checks.length })
                  : t("connectivity.checks_title")}
              {!running && lastRunAt
                ? ` · ${new Date(lastRunAt).toLocaleTimeString()}`
                : !running
                  ? ` · ${t("connectivity.never_run")}`
                  : ""}
            </span>
            <DownLine
              size={16}
              className={`shrink-0 text-text-tertiary transition-transform duration-200 ${showChecks ? "rotate-180" : ""}`}
            />
          </button>

          <AnimatePresence initial={false}>
            {showChecks ? (
              <motion.div
                id="connectivity-check-details"
                key="connectivity-check-details"
                initial={{ height: 0, opacity: 0, y: -4 }}
                animate={{ height: "auto", opacity: 1, y: 0 }}
                exit={{ height: 0, opacity: 0, y: -4 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                className="mt-[8px] overflow-hidden"
              >
                <div className="flex flex-col gap-[4px] rounded-lg bg-bg-elevated/60 p-[10px]">
              {running && checks.length === 0 ? (
                <p
                  className="m-0 px-[2px] py-[4px] text-[12px] text-text-tertiary"
                  style={{ fontFamily: "var(--font-inter), sans-serif" }}
                >
                  {t("connectivity.retrying")}
                </p>
              ) : null}
              {checks.map((check, idx) => (
                <div key={`${check.id}-${check.host ?? ""}-${idx}`} className="flex items-start gap-[8px] px-[2px] py-[3px]">
                  <StatusDot status={check.status} />
                  <div className="min-w-0 flex-1">
                    <p
                      className="m-0 text-[12px] font-[500] text-text-primary"
                      style={{ fontFamily: "var(--font-inter), sans-serif" }}
                    >
                      {checkLabel(check)}
                      {typeof check.latencyMs === "number" ? (
                        <span className="font-[400] text-text-tertiary"> · {check.latencyMs}ms</span>
                      ) : null}
                    </p>
                    {check.detail ? (
                      <p
                        className="m-0 truncate text-[11px] text-text-tertiary"
                        title={check.detail}
                        style={{ fontFamily: "var(--font-inter), sans-serif" }}
                      >
                        {check.detail}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className="shrink-0 text-[11px] text-text-tertiary"
                    style={{ fontFamily: "var(--font-inter), sans-serif" }}
                  >
                    {t(`connectivity.status_${check.status}`)}
                  </span>
                </div>
              ))}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <div className="mt-[18px] flex flex-wrap items-center gap-[8px]">
          <Button
            variant="primary"
            onClick={() => void retry()}
            disabled={running}
            className="!h-[38px] px-[20px] !text-[13px]"
          >
            {running ? t("connectivity.retrying") : t("connectivity.retry")}
          </Button>
          <Button
            variant="outline"
            onClick={() => void handleCopy()}
            className="!h-[38px] px-[14px] !text-[13px] flex items-center gap-[6px]"
          >
            <CopyLine size={15} />
            {t("connectivity.copy_dump")}
          </Button>
          <Button
            variant="outline"
            onClick={() => downloadDump(dump)}
            className="!h-[38px] px-[14px] !text-[13px] flex items-center gap-[6px]"
          >
            <DownloadLine size={15} />
            {t("connectivity.download_dump")}
          </Button>
        </div>
      </div>
    </div>
  );
}
