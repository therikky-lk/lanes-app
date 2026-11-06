import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { FaSpotify, FaYoutube, FaSoundcloud, FaApple, FaDeezer } from "react-icons/fa";
import { useTranslation } from "@/languages";
import { PhoneMenuItem } from "@/shared/ui/PhoneMenu";

const services = [
  { name: "Spotify", Icon: FaSpotify },
  { name: "YouTube", Icon: FaYoutube },
  { name: "SoundCloud", Icon: FaSoundcloud },
  { name: "Apple Music", Icon: FaApple },
  { name: "Deezer", Icon: FaDeezer },
];

export default function ImportMenuItem({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (reducedMotion) return;
    const timer = setInterval(() => setIndex(value => (value + 1) % services.length), 2400);
    return () => clearInterval(timer);
  }, [reducedMotion]);
  const { name, Icon } = services[index];
  const transition = { duration: reducedMotion ? 0 : 0.3 };
  return (
    <PhoneMenuItem
      icon={<motion.span key={name} aria-hidden className="flex h-4 w-4 shrink-0 items-center justify-center text-text-secondary" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={transition}><Icon size={16} /></motion.span>}
      label={<motion.span key={name} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={transition}>{t("library.import_from_service", { service: name })}</motion.span>}
      onClick={onClick}
    />
  );
}
