import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { PlanBar, isPlanned } from "@/components/PlanBar";
import { birthDayMonth, byFio, fio, useStore } from "@/lib/store";
import { absenceAt } from "@/lib/people";
import {
  MONTHS,
  MONTHS_SHORT,
  daysInMonth,
  iso,
  WEEKDAYS_SHORT,
  weekdayIndex,
} from "@/lib/dates";

export const Route = createFileRoute("/employee")({
  head: () => ({
    meta: [
      { title: "Сотрудник — АРВ" },
      { name: "description", content: "Личный календарь сотрудника: проекты, отсутствия, задачи." },
      { property: "og:title", content: "Сотрудник — АРВ" },
      {
        property: "og:description",
        content: "Личный календарь сотрудника: проекты, отсутствия, задачи.",
      },
    ],
  }),
  component: EmployeePage,
});

const EMP_LEGEND = [
  { code: "Б", label: "больничный лист" },
  { code: "ОТ", label: "отпуск оплачиваемый" },
  { code: "ДО", label: 'отпуск "за свой счет"' },
  { code: "У", label: "учебный отпуск" },
  { code: "🎂", label: "день рождения" },
  { code: "🟡", label: "личное напоминание" },
  { code: "🟥", label: "конфликт: отсутствие и занятость" },
];

const dayRange = (a: number, b: number) => {
  const [s, e] = a <= b ? [a, b] : [b, a];
  return Array.from({ length: e - s + 1 }, (_, i) => s + i);
};

function EmployeePage() {
  const { store, update, isWorkday, setPlanCells, currentUser, can } = useStore();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [view, setView] = useState<"month" | "year">("month");
  const employees = [...store.employees.filter((e) => !e.hidden)].sort(byFio);
  const [personId, setPersonId] = useState(currentUser?.id ?? employees[0]?.id ?? "");
  const person = store.employees.find((e) => e.id === personId) ?? employees[0];
  const editable = can("editDepartment");
  const isSelf = person?.id === currentUser?.id;

  const [selDays, setSelDays] = useState<number[]>([]);
  const anchor = useRef<number | null>(null);
  const dragging = useRef(false);

  const startSelect = (
    d: number,
    e: { button?: number; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean },
  ) => {
    if (!editable) return;
    if (e.button !== undefined && e.button !== 0) return;
    if (e.shiftKey && anchor.current !== null) {
      setSelDays(dayRange(anchor.current, d));
      dragging.current = false;
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      setSelDays((prev) =>
        prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b),
      );
      anchor.current = d;
      dragging.current = false;
      return;
    }
    anchor.current = d;
    dragging.current = true;
    setSelDays([d]);
  };
  const overSelect = (d: number) => {
    if (!dragging.current || anchor.current === null) return;
    setSelDays(dayRange(anchor.current, d));
  };
  const targetDates = (d: number) =>
    (selDays.includes(d) ? selDays : [d]).map((x) => iso(year, month, x));

  if (!person) return <p>Нет сотрудников</p>;

  const birthMd = person.birthDate ? person.birthDate.slice(5) : "";
  const isBirthday = (date: string) => !!birthMd && date.slice(5) === birthMd;

  const dim = daysInMonth(year, month);
  const firstWd = weekdayIndex(year, month, 1);
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWd }, () => null),
    ...Array.from({ length: dim }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const usedProjects = store.projects.filter((p) =>
    Array.from({ length: dim }, (_, i) => iso(year, month, i + 1)).some(
      (date) => store.plan[p.id]?.[person.id]?.[date] === "Р",
    ),
  );


  return (
    <div onMouseUp={() => (dragging.current = false)}>
      <h1 className="text-2xl font-semibold">Сотрудник</h1>
      {editable && (
        <p className="mt-1 text-xs text-muted-foreground">
          Выделяйте несколько дней протяжкой мыши, Shift или Ctrl, затем ПКМ — задать занятость сразу
          для всех выбранных дней{selDays.length > 1 ? ` (выбрано: ${selDays.length})` : ""}.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Select value={person.id} onValueChange={setPersonId}>
          <SelectTrigger className="w-[280px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {employees.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {fio(e)}
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

      <div className="mt-4">
        <h2 className="text-lg font-medium">{fio(person)}</h2>
        <p className="text-sm text-muted-foreground">
          {person.position} · {person.department} ·{" "}
          {person.fullTime ? "полный день" : "неполный день"}
        </p>
        {person.birthDate && (
          <p className="mt-1 inline-block rounded-md px-2 py-1 text-sm font-medium"
            style={{ background: "#ffd9ec" }}>
            🎂 День рождения: {birthDayMonth(person.birthDate)}
          </p>
        )}

      </div>

      <p className="mt-5 text-sm font-medium">
        {view === "month" ? `${MONTHS[month]} ${year}` : `${year} год`}
      </p>

      <div className="mt-3 flex gap-4">
        <div className="min-w-0 flex-1 overflow-hidden rounded-lg border bg-card">
          {view === "month" ? (
            <>
              <div className="grid grid-cols-7 border-b bg-muted text-center text-xs font-medium">
                {WEEKDAYS_SHORT.map((w) => (
                  <div key={w} className="border-r py-2 last:border-r-0">
                    {w}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {cells.map((d, i) => {
                  if (d === null)
                    return <div key={i} className="min-h-24 border-r border-b bg-muted/40" />;
                  const date = iso(year, month, d);
                  const absence = absenceAt(store, person.id, date);
                  const bday = isBirthday(date);
                  const active = store.projects.filter(
                    (pr) => store.plan[pr.id]?.[person.id]?.[date] === "Р",
                  );
                  const event = store.personalEvents[person.id]?.[date];
                  const conflict = !!absence && active.length > 0;
                  const selected = selDays.includes(d);
                  return (
                    <ContextMenu key={i}>
                      <ContextMenuTrigger asChild>
                        <div
                          className="min-h-24 border-r border-b p-1 text-xs select-none last:border-r-0"
                          title={
                            conflict
                              ? `Конфликт: ${absence} и занятость на проектах (${active
                                  .map((x) => x.name)
                                  .join(", ")})`
                              : undefined
                          }
                          onMouseDown={(e) => startSelect(d, e)}
                          onMouseEnter={() => overSelect(d)}
                          onContextMenu={() => {
                            if (editable && !selDays.includes(d)) {
                              anchor.current = d;
                              setSelDays([d]);
                            }
                          }}
                          style={{
                            background: conflict
                              ? "#ffd9d9"
                              : bday
                                ? "#ffd9ec"
                                : absence
                                  ? "#e2e2e2"
                                  : isWorkday(date)
                                    ? undefined
                                    : "var(--weekend)",
                            boxShadow: conflict ? "inset 0 0 0 2px #dc2626" : undefined,
                            outline: selected ? "2px solid var(--primary)" : undefined,
                            outlineOffset: "-2px",
                          }}
                        >
                          <div className="mb-1 flex items-center justify-between font-medium">
                            <span>{d}</span>
                            {bday && <span title="День рождения">🎂</span>}
                          </div>
                          {absence && <div className="mb-1 font-medium">{absence}</div>}
                          {active.map((pr) => {
                            const wd = weekdayIndex(year, month, d);
                            const first =
                              d === 1 ||
                              wd === 0 ||
                              !isPlanned(store, pr.id, person.id, iso(year, month, d - 1));
                            const last =
                              d === dim ||
                              wd === 6 ||
                              !isPlanned(store, pr.id, person.id, iso(year, month, d + 1));
                            return (
                              <PlanBar
                                key={pr.id}
                                color={pr.color}
                                name={pr.name}
                                first={first}
                                last={last}
                                extendPx={5}
                                height={16}
                              >
                                <span className="block truncate px-1 py-0.5 text-[10px] text-white">
                                  {first ? pr.name : "\u00A0"}
                                </span>
                              </PlanBar>
                            );
                          })}
                          {event && (
                            <div
                              className="mb-0.5 truncate rounded px-1 py-0.5 text-[10px] font-semibold"
                              style={{ background: "#ffe600", color: "#3b2f00", boxShadow: "inset 0 0 0 1px #d4bb00" }}
                              title={event}
                            >
                              {event}
                            </div>
                          )}
                        </div>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        {editable &&
                          store.projects.map((pr) => (
                            <ContextMenuItem
                              key={pr.id}
                              onSelect={() => {
                                setPlanCells(pr.id, person.id, targetDates(d), "Р");
                                toast.success(
                                  `Занятость задана: ${targetDates(d).length} дн.`,
                                );
                                setSelDays([]);
                              }}
                            >
                              Занять: {pr.name}
                            </ContextMenuItem>
                          ))}
                        {editable && (
                          <>
                            <ContextMenuItem
                              onSelect={() => {
                                const dates = targetDates(d);
                                store.projects.forEach((pr) =>
                                  setPlanCells(pr.id, person.id, dates, null),
                                );
                                setSelDays([]);
                              }}
                            >
                              Снять занятость
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                          </>
                        )}
                        <ContextMenuItem
                          onSelect={() => {
                            const t = window.prompt("Задача или напоминание", event ?? "");
                            if (t === null) return;
                            update((dd) => {
                              dd.personalEvents[person.id] = dd.personalEvents[person.id] ?? {};
                              for (const dt of targetDates(d)) {
                                if (t) dd.personalEvents[person.id]![dt] = t;
                                else delete dd.personalEvents[person.id]![dt];
                              }
                            });
                            toast.success("Сохранено");
                          }}
                        >
                          Задача / напоминание…
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {MONTHS_SHORT.map((mn, m) => {
                const dates = Array.from({ length: daysInMonth(year, m) }, (_, i) =>
                  iso(year, m, i + 1),
                );
                const projs = store.projects.filter((pr) =>
                  dates.some((date) => store.plan[pr.id]?.[person.id]?.[date] === "Р"),
                );
                const absDays = dates.filter((date) => absenceAt(store, person.id, date)).length;
                const tasks = dates.filter((date) => store.personalEvents[person.id]?.[date]).length;
                const bday = dates.some(isBirthday);
                return (
                  <button
                    key={mn}
                    className="rounded-lg border p-2 text-left text-xs hover:shadow-md"
                    style={{ background: bday ? "#ffd9ec" : undefined }}
                    onClick={() => {
                      setMonth(m);
                      setView("month");
                    }}
                  >
                    <div className="mb-1 font-medium">
                      {MONTHS[m]} {bday && "🎂"}
                    </div>
                    {projs.map((pr) => (
                      <div key={pr.id} className="mb-0.5 flex items-center gap-1">
                        <span className="size-2 rounded-full" style={{ background: pr.color }} />
                        <span className="truncate">{pr.name}</span>
                      </div>
                    ))}
                    {absDays > 0 && (
                      <div className="text-muted-foreground">отсутствия: {absDays} д.</div>
                    )}
                    {tasks > 0 && <div className="text-muted-foreground">задач: {tasks}</div>}
                    {projs.length === 0 && absDays === 0 && tasks === 0 && (
                      <div className="text-muted-foreground">—</div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
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
          {isSelf && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3 w-full"
              onClick={() => toast.info("ПКМ по дню — добавить задачу")}
            >
              Как добавить задачу?
            </Button>
          )}
        </div>
      </div>

      <Legend items={EMP_LEGEND} />
    </div>
  );
}
