import { createFileRoute } from "@tanstack/react-router";
import { soft } from "@/lib/colors";
import { useMemo, useState } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MonthPicker, Legend } from "@/components/MonthPicker";
import { PersonLink } from "@/components/PersonLink";
import { Button } from "@/components/ui/button";

import { useRowSelection } from "@/components/useRowSelection";
import { PlanBar, isPlanned } from "@/components/PlanBar";
import { fio, useStore } from "@/lib/store";
import { allPeople, absenceAt } from "@/lib/people";
import {
  MONTHS,
  MONTHS_SHORT,
  daysInMonth,
  iso,
  WEEKDAYS_SHORT,
  weekdayIndex,
} from "@/lib/dates";


export const Route = createFileRoute("/department")({
  head: () => ({
    meta: [
      { title: "Отдел — ARV. Трудозатораты" },
      { name: "description", content: "Загрузка сотрудников отдела по проектам и дням месяца." },
      { property: "og:title", content: "Отдел — ARV. Трудозатораты" },
      {
        property: "og:description",
        content: "Загрузка сотрудников отдела по проектам и дням месяца.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DepartmentPage,
});

const DEPT_LEGEND = [
  { code: "Б", label: "больничный лист" },
  { code: "ОТ", label: "отпуск оплачиваемый" },
  { code: "ДО", label: 'отпуск "за свой счет"' },
  { code: "У", label: "учебный отпуск" },
  { code: "▬", label: "занятость на проекте" },
  { code: "🟥", label: "конфликт: отсутствие и занятость" },
];

function DepartmentPage() {
  const { store, isWorkday, setPlanCells, can } = useStore();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [view, setView] = useState<"month" | "year">("month");
  const people = allPeople(store);
  const departments = Array.from(new Set(people.map((p) => p.department))).sort();
  const [dept, setDept] = useState(departments[0] ?? "all");
  const sel = useRowSelection();
  const editable = can("editDepartment");

  const days = Array.from({ length: daysInMonth(year, month) }, (_, i) => i + 1);

  const rows = useMemo(
    () =>
      people
        .filter((p) => dept === "all" || p.department === dept)
        // подрядчики — в конце списка
        .sort(
          (a, b) =>
            (a.kind === "contractor" ? 1 : 0) - (b.kind === "contractor" ? 1 : 0) ||
            a.name.localeCompare(b.name, "ru"),
        ),
    [people, dept],
  );

  const head = store.employees.find(
    (e) => e.position === "Руководитель отдела" && e.department === dept,
  );

  const usedProjects = store.projects.filter((p) =>
    rows.some((r) =>
      days.some((d) => store.plan[p.id]?.[r.id]?.[iso(year, month, d)] === "Р"),
    ),
  );

  return (
    <div onMouseUp={sel.onMouseUp}>
      <h1 className="text-2xl font-semibold">Отдел</h1>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Select value={dept} onValueChange={setDept}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Отдел" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все отделы</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
            <Button variant="outline" size="sm" onClick={() => setYear(year - 1)}>
              ‹
            </Button>
            <span className="w-14 text-center text-sm font-medium">{year}</span>
            <Button variant="outline" size="sm" onClick={() => setYear(year + 1)}>
              ›
            </Button>
          </div>
        )}
        <Button variant="outline" onClick={() => setView(view === "month" ? "year" : "month")}>
          {view === "month" ? "Вид по годам" : "Вид по месяцу"}
        </Button>
      </div>

      <p className="mt-3 text-sm">
        Руководитель отдела:{" "}
        <span className="font-medium">{head ? fio(head) : "не назначен"}</span>
      </p>
      <p className="mt-1 text-sm font-medium">
        Табель отдела · {view === "month" ? `${MONTHS[month]} ${year}` : `${year} год`}
      </p>

      <div className="mt-3 flex gap-4">
        <div className="min-w-0 flex-1 overflow-x-auto rounded-lg border bg-card">
          {view === "month" ? (
          <table className="grid-table w-full">

            <thead>
              <tr className="bg-muted">
                <th className="sticky left-0 z-10 min-w-[220px] border-r border-b bg-muted px-3 py-2 text-left text-xs font-medium">
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
              {rows.map((p) => (
                <tr key={p.id}>
                  <th className="sticky left-0 z-10 border-r border-b bg-card px-3 py-1 text-left text-xs font-normal">
                    <PersonLink id={p.id} name={p.name} />
                    <span className="ml-1 text-muted-foreground">· {p.department}</span>
                  </th>
                  {days.map((d) => {
                    const date = iso(year, month, d);
                    const absence = absenceAt(store, p.id, date);
                    const active = store.projects.filter(
                      (pr) => store.plan[pr.id]?.[p.id]?.[date] === "Р",
                    );
                    const conflict = !!absence && active.length > 0;
                    const selected = sel.isSelected(p.id, d);
                    return (
                      <ContextMenu key={d}>
                        <ContextMenuTrigger asChild>
                          <td
                            className="day-cell cursor-pointer align-top"
                            title={
                              conflict
                                ? `Конфликт: ${absence} и занятость (${active
                                    .map((x) => x.name)
                                    .join(", ")})`
                                : undefined
                            }
                            style={{
                              background: conflict
                                ? "#ffd9d9"
                                : absence
                                  ? "#e2e2e2"
                                  : isWorkday(date)
                                    ? undefined
                                    : "var(--weekend)",
                              boxShadow: conflict ? "inset 0 0 0 2px #dc2626" : undefined,
                              outline: selected ? "2px solid var(--primary)" : undefined,
                              outlineOffset: "-2px",
                            }}
                            onMouseDown={(e) => editable && sel.onMouseDown(p.id, d, e)}
                            onMouseEnter={() => editable && sel.onMouseEnter(p.id, d)}
                            onContextMenu={() => editable && sel.ensureSelected(p.id, d)}
                          >
                            <div className="flex flex-col items-center gap-[1px] py-[1px]">
                              {absence && (
                                <span className="text-[10px] leading-none font-medium">
                                  {absence}
                                </span>
                              )}
                              {active.map((pr) => (
                                <PlanBar
                                  key={pr.id}
                                  color={pr.color}
                                  name={pr.name}
                                  first={
                                    d === 1 || !isPlanned(store, pr.id, p.id, iso(year, month, d - 1))
                                  }
                                  last={
                                    d === days.length ||
                                    !isPlanned(store, pr.id, p.id, iso(year, month, d + 1))
                                  }
                                />
                              ))}
                            </div>
                          </td>
                        </ContextMenuTrigger>

                        {editable && (
                          <ContextMenuContent>
                            {store.projects.map((pr) => (
                              <ContextMenuItem
                                key={pr.id}
                                onSelect={() => {
                                  setPlanCells(
                                    pr.id,
                                    p.id,
                                    (sel.sel?.days ?? [d]).map((x) => iso(year, month, x)),
                                    "Р",
                                  );
                                  sel.clear();
                                }}
                              >
                                Занять: {pr.name}
                              </ContextMenuItem>
                            ))}
                            <ContextMenuSeparator />
                            <ContextMenuItem
                              onSelect={() => {
                                const dates = (sel.sel?.days ?? [d]).map((x) =>
                                  iso(year, month, x),
                                );
                                store.projects.forEach((pr) =>
                                  setPlanCells(pr.id, p.id, dates, null),
                                );
                                sel.clear();
                              }}
                            >
                              Снять занятость
                            </ContextMenuItem>
                          </ContextMenuContent>
                        )}
                      </ContextMenu>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          ) : (
            <table className="grid-table w-full">
              <thead>
                <tr className="bg-muted">
                  <th className="min-w-[220px] border-r border-b px-3 py-2 text-left text-xs font-medium">
                    ФИО
                  </th>
                  {MONTHS_SHORT.map((m) => (
                    <th key={m} className="border-r border-b px-2 py-2 text-xs font-medium">
                      {m}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <th className="border-r border-b px-3 py-1 text-left text-xs font-normal">
                      <PersonLink id={p.id} name={p.name} />
                      <span className="ml-1 text-muted-foreground">· {p.department}</span>
                    </th>
                    {MONTHS_SHORT.map((_, m) => {
                      const dates = Array.from({ length: daysInMonth(year, m) }, (_, i) =>
                        iso(year, m, i + 1),
                      );
                      const projs = store.projects.filter((pr) =>
                        dates.some((date) => store.plan[pr.id]?.[p.id]?.[date] === "Р"),
                      );
                      const absDays = dates.filter((date) => absenceAt(store, p.id, date)).length;
                      return (
                        <td key={m} className="h-9 border-r border-b px-1 align-middle">
                          <div className="flex flex-col items-center gap-[2px]">
                            {absDays > 0 && (
                              <span className="text-[10px] leading-none text-muted-foreground">
                                отс. {absDays} д.
                              </span>
                            )}
                            {projs.map((pr) => (
                              <span
                                key={pr.id}
                                className="h-1.5 w-full rounded-full"
                                style={{ background: soft(pr.color) }}
                                title={pr.name}
                              />
                            ))}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>


        <div className="w-52 shrink-0 rounded-lg border bg-card p-3 text-xs">
          <div className="mb-2 font-medium">Проекты</div>
          {usedProjects.length === 0 && (
            <p className="text-muted-foreground">Занятости в этом месяце нет</p>
          )}
          {usedProjects.map((p) => (
            <div key={p.id} className="mb-1 flex items-center gap-2">
              <span className="size-3 rounded-full" style={{ background: soft(p.color) }} />
              {p.name}
            </div>
          ))}
        </div>
      </div>

      <Legend items={DEPT_LEGEND} />
    </div>
  );
}
