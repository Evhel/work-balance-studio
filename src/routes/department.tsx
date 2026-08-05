import { createFileRoute } from "@tanstack/react-router";
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

import { useRowSelection } from "@/components/useRowSelection";
import { fio, useStore } from "@/lib/store";
import { allPeople, absenceAt } from "@/lib/people";
import { MONTHS, daysInMonth, iso, WEEKDAYS_SHORT, weekdayIndex } from "@/lib/dates";

export const Route = createFileRoute("/department")({
  head: () => ({
    meta: [
      { title: "Отдел — АРВ" },
      { name: "description", content: "Загрузка сотрудников отдела по проектам и дням месяца." },
      { property: "og:title", content: "Отдел — АРВ" },
      {
        property: "og:description",
        content: "Загрузка сотрудников отдела по проектам и дням месяца.",
      },
    ],
  }),
  component: DepartmentPage,
});

const DEPT_LEGEND = [
  { code: "Б", label: "больничный лист (серое)" },
  { code: "ОТ", label: "отпуск оплачиваемый (серое)" },
  { code: "ДО", label: 'отпуск "за свой счет" (серое)' },
  { code: "У", label: "учебный отпуск (серое)" },
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
        .sort((a, b) => a.name.localeCompare(b.name, "ru")),
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
        <MonthPicker
          year={year}
          month={month}
          onChange={(y, m) => {
            setYear(y);
            setMonth(m);
          }}
        />
      </div>

      <p className="mt-3 text-sm">
        Руководитель отдела:{" "}
        <span className="font-medium">{head ? fio(head) : "не назначен"}</span>
      </p>
      <p className="mt-1 text-sm font-medium">
        Табель отдела · {MONTHS[month]} {year}
      </p>

      <div className="mt-3 flex gap-4">
        <div className="min-w-0 flex-1 overflow-x-auto rounded-lg border bg-card">
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
                            <div className="flex flex-col items-center gap-[1px] px-[1px] py-[1px]">
                              {absence && (
                                <span className="text-[10px] leading-none font-medium">
                                  {absence}
                                </span>
                              )}
                              {active.map((pr) => (
                                <span
                                  key={pr.id}
                                  className="h-1.5 w-full rounded-full"
                                  style={{ background: pr.color }}
                                  title={pr.name}
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
        </div>

        <div className="w-52 shrink-0 rounded-lg border bg-card p-3 text-xs">
          <div className="mb-2 font-medium">Проекты</div>
          {usedProjects.length === 0 && (
            <p className="text-muted-foreground">Занятости в этом месяце нет</p>
          )}
          {usedProjects.map((p) => (
            <div key={p.id} className="mb-1 flex items-center gap-2">
              <span className="size-3 rounded-full" style={{ background: p.color }} />
              {p.name}
            </div>
          ))}
        </div>
      </div>

      <Legend items={DEPT_LEGEND} />
    </div>
  );
}
