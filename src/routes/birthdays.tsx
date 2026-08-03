import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { MonthPicker } from "@/components/MonthPicker";
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
  const days = Array.from({ length: daysInMonth(year, month) }, (_, i) => i + 1);
  const people = [...store.employees.filter((e) => !e.hidden)].sort(byFio);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Календарь дней рождений</h1>
      <div className="mt-4">
        <MonthPicker
          year={year}
          month={month}
          onChange={(y, m) => {
            setYear(y);
            setMonth(m);
          }}
        />
      </div>
      <p className="mt-4 text-sm font-medium">
        {MONTHS[month]} {year}
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
                    {fio(p)}
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
