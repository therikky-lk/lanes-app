import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeftLine } from "@mingcute/react";
import { LANE_LINK_ORIGIN } from "@/shared/api/baseUrl";

interface DailyStatsResponse {
  days: Array<{
    day: string;
    activeUsers: number;
    listenedMinutes: number;
    loginCountries: Array<{ country: string; logins: number }>;
  }>;
}

export default function StatsPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DailyStatsResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const isRussian = typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("ru");

  useEffect(() => {
    let active = true;
    fetch(`${LANE_LINK_ORIGIN}/v1/public/stats/daily?days=7`, { cache: "no-store" })
      .then(response => {
        if (!response.ok) throw new Error("stats unavailable");
        return response.json() as Promise<DailyStatsResponse>;
      })
      .then(data => { if (active) setStats(data); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);

  const activeUserDays = stats?.days.reduce((sum, day) => sum + day.activeUsers, 0) ?? 0;
  const listenedMinutes = stats?.days.reduce((sum, day) => sum + day.listenedMinutes, 0) ?? 0;
  const countryTotals = stats
    ? Array.from(new Map(stats.days.flatMap(day => day.loginCountries).map(item => [item.country, item.logins])).entries())
      .sort((a, b) => b[1] - a[1]).slice(0, 12)
    : [];

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-bg-primary">
      <header className="flex h-[60px] shrink-0 items-center gap-[12px] border-b border-border-primary/50 px-[16px] md:px-[32px]">
        <button type="button" aria-label={isRussian ? "Назад" : "Back"} onClick={() => navigate(-1)} className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full border-0 bg-white/[0.05] text-text-secondary transition-colors hover:bg-white/[0.1] hover:text-text-primary">
          <ArrowLeftLine size={19} />
        </button>
        <div className="min-w-0">
          <h1 className="m-0 truncate text-[18px] font-[650] text-text-primary">{isRussian ? "Статистика приложения" : "App statistics"}</h1>
          <p className="m-0 mt-[2px] text-[11px] text-text-tertiary">{isRussian ? "Сводка за последние 7 дней" : "Summary for the last 7 days"}</p>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-[16px] py-[22px] md:px-[32px]">
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-[18px]">
          {stats && <>
            <section className="grid grid-cols-1 gap-[12px] sm:grid-cols-2">
              <article className="rounded-[16px] border border-border-primary/40 bg-bg-panel/60 p-[18px]">
                <p className="m-0 text-[12px] text-text-tertiary">{isRussian ? "Активных пользователей-дней" : "Active user-days"}</p>
                <p className="m-0 mt-[8px] text-[30px] font-[650] leading-none tabular-nums text-text-primary">{activeUserDays.toLocaleString()}</p>
              </article>
              <article className="rounded-[16px] border border-border-primary/40 bg-bg-panel/60 p-[18px]">
                <p className="m-0 text-[12px] text-text-tertiary">{isRussian ? "Время прослушивания" : "Listening time"}</p>
                <p className="m-0 mt-[8px] text-[30px] font-[650] leading-none tabular-nums text-text-primary">{listenedMinutes.toLocaleString()} <span className="text-[14px] font-[500] text-text-secondary">{isRussian ? "мин" : "min"}</span></p>
              </article>
            </section>

            <section className="rounded-[16px] border border-border-primary/40 bg-bg-panel/45 p-[16px]">
              <h2 className="m-0 mb-[10px] text-[14px] font-[600] text-text-primary">{isRussian ? "По дням" : "Daily activity"}</h2>
              <div className="flex flex-col gap-[6px]">
                {[...stats.days].reverse().map(day => <div key={day.day} className="flex items-center justify-between gap-[12px] rounded-[10px] bg-white/[0.035] px-[12px] py-[10px] text-[12px]">
                  <span className="text-text-secondary">{new Date(`${day.day}T00:00:00`).toLocaleDateString(navigator.language, { weekday: "short", month: "short", day: "numeric" })}</span>
                  <span className="text-right text-text-tertiary">{day.activeUsers} {isRussian ? "чел." : "users"} <span className="mx-[4px] opacity-40">·</span> {day.listenedMinutes} {isRussian ? "мин" : "min"}</span>
                </div>)}
              </div>
            </section>

            <section className="rounded-[16px] border border-border-primary/40 bg-bg-panel/45 p-[16px]">
              <h2 className="m-0 mb-[10px] text-[14px] font-[600] text-text-primary">{isRussian ? "Страны входа" : "Login countries"}</h2>
              {countryTotals.length > 0 ? <div className="flex flex-wrap gap-[8px]">
                {countryTotals.map(([country, logins]) => {
                  let name = country.toUpperCase();
                  try { if (country !== "unknown") name = new Intl.DisplayNames([navigator.language], { type: "region" }).of(country.toUpperCase()) || name; } catch {}
                  return <span key={country} className="rounded-full bg-white/[0.06] px-[12px] py-[7px] text-[12px] text-text-secondary">{name}<span className="ml-[7px] text-text-tertiary">{logins}</span></span>;
                })}
              </div> : <p className="m-0 text-[12px] text-text-tertiary">{isRussian ? "Данных пока нет" : "No data yet"}</p>}
            </section>
          </>}
          {!stats && <div role={failed ? "status" : "progressbar"} className="rounded-[16px] border border-border-primary/40 bg-bg-panel/45 px-[16px] py-[22px] text-[13px] text-text-tertiary">
            {failed ? (isRussian ? "Статистика пока недоступна" : "Statistics are currently unavailable") : (isRussian ? "Загружаем статистику…" : "Loading statistics…")}
          </div>}
        </div>
      </main>
    </div>
  );
}
