import { DownLine } from "@mingcute/react";
import Button from "./Button";

/** A consistent bottom-centred affordance for showing a section's remaining content. */
export default function SectionExpandButton({ label, expanded, controls, onClick }: {
  label: string;
  expanded?: boolean;
  controls?: string;
  onClick: () => void;
}) {
  return <div className="mt-[6px] flex w-full justify-center">
    <Button variant="secondary" size="icon" type="button" aria-label={label} title={label}
      aria-expanded={expanded} aria-controls={controls} onClick={onClick}>
      <DownLine size={20} aria-hidden="true" className={`transition-transform duration-200 motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`} />
    </Button>
  </div>;
}
