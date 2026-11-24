import { useTranslation } from "@/languages";
import { countryMixBadge, countryMixCover } from "../mixes/countryMixes";
import { MixCoverFrame } from "./MixCover";

export default function CountryMixCover({ country, name, compact }: { country: string; name: string; compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <MixCoverFrame title={countryMixBadge(t)} subtitle={name} compact={compact}>
      <img src={countryMixCover(country)} alt="" loading="lazy" draggable={false}
        className="pointer-events-none absolute inset-0 block h-full w-full object-fill" />
    </MixCoverFrame>
  );
}
