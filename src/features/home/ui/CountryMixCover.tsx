import { COUNTRY_MIX_SIZE, countryMixCover } from "../mixes/countryMixes";
import { MixCoverFrame } from "./MixCover";

export default function CountryMixCover({ country, name, compact }: { country: string; name: string; compact?: boolean }) {
  return (
    <MixCoverFrame title={`Top ${COUNTRY_MIX_SIZE}`} subtitle={name} compact={compact}>
      <img src={countryMixCover(country)} alt="" loading="lazy" draggable={false}
        className="pointer-events-none absolute inset-0 block h-full w-full object-fill" />
    </MixCoverFrame>
  );
}
