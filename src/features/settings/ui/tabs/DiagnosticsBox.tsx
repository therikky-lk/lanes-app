import { useEffect, useState } from "react";
import { diagLines, onDiag } from "@/shared/platform/diag";

/** Android test builds: what went wrong recently, copyable for bug reports */
export default function DiagnosticsBox() {
  const [lines, setLines] = useState<readonly string[]>(() => [...diagLines()]);
  const [copied, setCopied] = useState(false);
  useEffect(() => onDiag(() => setLines([...diagLines()])), []);
  const text = lines.join("\n");
  return (
    <div className="mt-[16px] w-full max-w-[440px] rounded-2xl border border-border-primary/40 bg-border-alpha-14 p-[14px] text-left">
      <div className="mb-[8px] flex items-center justify-between">
        <span className="text-[13px] font-[600] text-text-primary">Diagnostics</span>
        <button
          type="button"
          disabled={!text}
          onClick={() => {
            void navigator.clipboard?.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="rounded-md border-0 bg-border-alpha-14 px-[10px] py-[5px] text-[12px] text-text-primary disabled:opacity-40 cursor-pointer"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="m-0 max-h-[260px] overflow-auto whitespace-pre-wrap break-all text-[11px] leading-[1.45] text-text-secondary">
        {text || "No errors yet. Play a track, then come back here."}
      </pre>
    </div>
  );
}
