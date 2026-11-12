import darkIcon from "@/assets/branding/yandex-music/icon-main.svg?inline";
import lightIcon from "@/assets/branding/yandex-music/icon-alternative.svg?inline";

export default function YandexMusicIcon({ size = 18, className = "", monochrome = false }: { size?: number; className?: string; monochrome?: boolean }) {
  if (monochrome) {
    return <span aria-hidden="true" className={`inline-block shrink-0 bg-current ${className}`}
      style={{ width: size, height: size, mask: `url("${darkIcon}") center / contain no-repeat` }} />;
  }
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 ${className}`} style={{ width: size, height: size }}>
      <img src={lightIcon} alt="" draggable={false} className="size-full object-contain dark:hidden" />
      <img src={darkIcon} alt="" draggable={false} className="hidden size-full object-contain dark:block" />
    </span>
  );
}
