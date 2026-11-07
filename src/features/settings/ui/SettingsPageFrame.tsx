import { motion, useDragControls } from "framer-motion";
import { useLocation, useNavigate, useNavigationType, useParams } from "react-router-dom";
import type { DialogProps } from "@/shared/ui/Dialog";

export default function SettingsPageFrame({ children, className }: DialogProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const action = useNavigationType();
  const { tab } = useParams();
  const controls = useDragControls();
  const direction = action === "POP" || location.state?.settingsDirection === -1 ? -1 : 1;
  const back = () => {
    if (location.state?.settingsParent) navigate(-1);
    else navigate("/settings", { replace: true, state: { settingsDirection: -1 } });
  };
  return <section className="lane-settings-page relative h-full w-full overflow-hidden bg-bg-primary" style={{ paddingTop: "var(--lane-safe-top, 0px)", paddingBottom: "var(--lane-dock-h, 58px)" }}>
    <div className="relative h-full overflow-hidden">
      <motion.div key={location.pathname} custom={direction}
        variants={{ enter: (dir: number) => ({ x: dir > 0 ? "100%" : "-22%" }), active: { x: 0 }, leave: (dir: number) => ({ x: dir > 0 ? "-22%" : "100%" }) }}
        initial="enter" animate="active"
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className={`${className} flex bg-bg-primary`}
        drag={tab ? "x" : false} dragListener={false} dragControls={controls}
        dragConstraints={{ left: 0, right: 0 }} dragElastic={{ left: 0, right: 0.6 }} dragMomentum={false}
        onDragEnd={(_, info) => { if (info.offset.x > 90 || info.velocity.x > 650) back(); }}
      >
        {tab && <div aria-hidden="true" data-settings-back-edge className="absolute inset-y-0 left-0 z-30 w-[24px] touch-none" onPointerDown={event => controls.start(event)} />}
        {children}
      </motion.div>
    </div>
  </section>;
}
