import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FaApple, FaDeezer, FaSoundcloud, FaSpotify, FaYoutube } from "react-icons/fa";

const services = [
  { name: "Spotify", Icon: FaSpotify },
  { name: "YouTube", Icon: FaYoutube },
  { name: "SoundCloud", Icon: FaSoundcloud },
  { name: "Deezer", Icon: FaDeezer },
  { name: "Apple Music", Icon: FaApple },
];

export default function ImportServiceIcon() {
  const [index, setIndex] = useState(0);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (reducedMotion) return;
    const timer = setInterval(() => setIndex((value) => (value + 1) % services.length), 2000);
    return () => clearInterval(timer);
  }, [reducedMotion]);
  const { name, Icon } = services[index];
  return (
    <span aria-hidden="true" title={name} className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={name} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
          <Icon size={16} />
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
