import { memo, useLayoutEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeftLine, ArrowRightLine } from "@mingcute/react";
import { LuGlobe } from "react-icons/lu";
import { useTranslation } from "@/languages";
import useHorizontalScroll from "@/shared/hooks/useHorizontalScroll";
import ScrollableRow from "@/shared/ui/ScrollableRow";
import { COUNTRY_MIX_COUNTRIES, countryMixId, countryMixTitle } from "../mixes/countryMixes";
import CountryMixCover from "./CountryMixCover";
import CountryGroupFilters, { CountryGroupSelect } from "./CountryGroupFilters";
import { countriesInGroup, type CountryGroup } from "../vibe/vibeLanguages";

function CountryMixesSection() {
  const { locale, t } = useTranslation();
  const scroll = useHorizontalScroll();
  const [group, setGroup] = useState<CountryGroup>("europe");
  const names = new Intl.DisplayNames(locale, { type: "region" });
  const countries = countriesInGroup(COUNTRY_MIX_COUNTRIES, group, country => country);
  useLayoutEffect(() => {
    const row = scroll.scrollRef.current;
    if (!row) return;
    row.scrollLeft = 0;
    row.dispatchEvent(new Event("scroll"));
  }, [group, scroll.scrollRef]);

  return (
    <section className="home-scroll-section flex min-w-0 flex-col overflow-hidden" aria-label={t("home.country_mixes")}>
      <div className="mt-[8px] flex min-w-0 items-center gap-3 px-4 md:gap-4 md:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 md:flex-none">
          <LuGlobe className="size-5 shrink-0 text-text-primary" aria-hidden />
          <h2 className="m-0 truncate text-[20px] font-semibold leading-tight tracking-tight text-text-primary">
            {t("home.country_mixes")}
          </h2>
        </div>
        <div className="max-w-[42%] shrink-0 md:hidden">
          <CountryGroupSelect value={group} onChange={setGroup} />
        </div>
        <div className="hidden min-w-0 flex-1 md:block">
          <CountryGroupFilters value={group} onChange={setGroup} />
        </div>
        <div className="hidden shrink-0 items-center gap-1 md:flex">
          <button type="button" onClick={scroll.scrollPrev} disabled={!scroll.canScrollLeft}
            aria-label={t("home.previous_mixes")}
            className="grid size-6 cursor-pointer place-items-center border-0 bg-transparent text-text-secondary disabled:invisible">
            <ArrowLeftLine size={16} />
          </button>
          <button type="button" onClick={scroll.scrollNext} disabled={!scroll.canScrollRight}
            aria-label={t("home.next_mixes")}
            className="grid size-6 cursor-pointer place-items-center border-0 bg-transparent text-text-secondary disabled:invisible">
            <ArrowRightLine size={16} />
          </button>
        </div>
      </div>
      <ScrollableRow controller={scroll}
        className="mt-[10px] min-w-0 flex-nowrap gap-4 px-4 pb-5 [--lane-row-inset:16px] md:gap-[28px] md:px-8 md:[--lane-row-inset:32px]">
        {countries.map(country => {
          const name = names.of(country) ?? country;
          return (
            <Link key={country} to={`/collection?type=playlist&id=${countryMixId(country)}`}
              draggable={false}
              className="group w-[142px] shrink-0 rounded-xl no-underline md:w-[175px]">
              <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-bg-elevated transition-opacity group-hover:opacity-90">
                <CountryMixCover country={country} name={name} />
              </div>
              <p className="m-0 mt-2 truncate text-[14px] text-text-primary">{countryMixTitle(t, name)}</p>
            </Link>
          );
        })}
      </ScrollableRow>
    </section>
  );
}

export default memo(CountryMixesSection);
