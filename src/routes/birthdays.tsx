import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { MonthPicker } from "@/components/MonthPicker";
import { PersonLink } from "@/components/PersonLink";
import { byFio, fio, useStore } from "@/lib/store";
import { MONTHS, daysInMonth, iso, weekdayIndex, WEEKDAYS_SHORT } from "@/lib/dates";

export const Route = createFileRoute("/birthdays")({
  head: () => ({
    meta: [
      { title: "Календарь дней рождений — АРВ" },
      { name: "description", content: "Дни рождения сотрудников проектного бюро по месяцам." },
      { property: "og:title", content: "Календарь дней рождений — АРВ" },
      {
        property: "og:description",
        content: "Дни рождения сотрудников проектного бюро по месяцам.",
      },
    ],
  }),
  component: BirthdaysPage,
});

function BirthdaysPage() {
  const { store, isWorkday } = useStore();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [view, setView] = useState<"month" | "year">("month");
  const days = Array.from({ length: daysInMonth(year, month) }, (_, i) => i + 1);
  const people = [...store.employees.filter((e) => !e.hidden)].sort(byFio);

  const byMonth = MONTHS.map((_, m) =>
    people.filter((p) => Number((p.birthDate || "").slice(5, 7)) === m + 1),
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold">✨🎂 Календарь дней рождений ⭐🎊</h1>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-md border">
          {(["month", "year"] as const).map((v) => (
            <button
              key={v}
              className={`px-3 py-1.5 text-sm ${
                view === v ? "bg-primary text-primary-foreground" : "bg-background"
              }`}
              onClick={() => setView(v)}
            >
              {v === "month" ? "По месяцам" : "По годам"}
            </button>
          ))}
        </div>
        {view === "month" ? (
          <MonthPicker
            year={year}
            month={month}
            onChange={(y, m) => {
              setYear(y);
              setMonth(m);
            }}
          />
        ) : (
          <div className="flex items-center gap-2">
            <button className="rounded-md border px-2 py-1 text-sm" onClick={() => setYear(year - 1)}>
              ‹
            </button>
            <span className="w-16 text-center text-sm font-medium">{year}</span>
            <button className="rounded-md border px-2 py-1 text-sm" onClick={() => setYear(year + 1)}>
              ›
            </button>
          </div>
        )}
      </div>

      {view === "year" && (
        <>
          <p className="mt-4 text-sm font-medium">✨ {year} год ✨</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {MONTHS.map((mn, m) => {
              const list = byMonth[m]!;
              return (
                <button
                  key={mn}
                  onClick={() => {
                    setMonth(m);
                    setView("month");
                  }}
                  className="rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary"
                  style={
                    list.length
                      ? { background: "linear-gradient(135deg,#ffe9f7,#fffbe6)" }
                      : undefined
                  }
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-medium">{mn}</span>
                    <span className="text-lg font-bold text-primary">
                      {list.length ? `🎂 ${list.length}` : "—"}
                    </span>
                  </div>
                  <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                    {list
                      .slice()
                      .sort(
                        (a, b) =>
                          Number(a.birthDate.slice(8, 10)) - Number(b.birthDate.slice(8, 10)),
                      )
                      .map((p) => (
                        <div key={p.id}>
                          {p.birthDate.slice(8, 10)} — {fio(p)}
                        </div>
                      ))}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {view === "month" && (
        <>
      <p className="mt-4 text-sm font-medium">
        ✨ {MONTHS[month]} {year} ✨
      </p>


      <div className="mt-3 overflow-x-auto rounded-lg border bg-card">
        <table className="grid-table w-full">
          <thead>
            <tr className="bg-muted">
              <th className="sticky left-0 z-10 min-w-[230px] border-r border-b bg-muted px-3 py-2 text-left text-xs font-medium">
                ФИО
              </th>
              {days.map((d) => (
                <th
                  key={d}
                  className="day-cell font-medium"
                  style={{
                    background: isWorkday(iso(year, month, d)) ? undefined : "var(--weekend)",
                  }}
                >
                  <div>{d}</div>
                  <div className="text-[9px] text-muted-foreground">
                    {WEEKDAYS_SHORT[weekdayIndex(year, month, d)]}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const [, bm, bd] = (p.birthDate || "").split("-").map(Number);
              return (
                <tr key={p.id}>
                  <th className="sticky left-0 z-10 border-r border-b bg-card px-3 py-1 text-left text-xs font-normal">
                    <PersonLink id={p.id} name={fio(p)} />
                  </th>
                  {days.map((d) => {
                    const isBd = bm === month + 1 && bd === d;
                    return (
                      <td
                        key={d}
                        className="day-cell"
                        style={
                          isBd
                            ? {
                                background:
                                  "linear-gradient(135deg,#ffd6f2,#fff3b0 50%,#c7f0ff)",
                                fontSize: "14px",
                              }
                            : {
                                background: isWorkday(iso(year, month, d))
                                  ? undefined
                                  : "var(--weekend)",
                              }
                        }
                        title={isBd ? `День рождения: ${fio(p)}` : undefined}
                      >
                        {isBd ? "🎉" : ""}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
