import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MonthPicker } from "@/components/MonthPicker";
import { useRowSelection } from "@/components/useRowSelection";
import { PlanBar, isPlanned } from "@/components/PlanBar";
import { PersonLink } from "@/components/PersonLink";
import { useStore } from "@/lib/store";
import { allPeople, absenceAt } from "@/lib/people";
import {
  MONTHS,
  MONTHS_SHORT,
  daysInMonth,
  iso,
  WEEKDAYS_SHORT,
  weekdayIndex,
} from "@/lib/dates";
import { PROJECT_STAGES, REMOTE_CODE, type ProjectGoal } from "@/lib/types";

export const Route = createFileRoute("/projects/$projectId")({
  head: () => ({
    meta: [
      { title: "Карточка проекта — ARV. Трудозатораты" },
      { name: "description", content: "План работ по проекту и загрузка участников по дням." },
      { property: "og:title", content: "Карточка проекта — ARV. Трудозатораты" },
      {
        property: "og:description",
        content: "План работ по проекту и загрузка участников по дням.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProjectPage,
});

const PROJECT_LEGEND = [
  { code: "Б", label: "больничный лист" },
  { code: "ОТ", label: "отпуск оплачиваемый" },
  { code: "ДО", label: 'отпуск "за свой счет"' },
  { code: "У", label: "учебный отпуск" },
  { code: "НН", label: "неявка" },
  { code: "▬", label: "занятость на проекте" },
];


function ProjectPage() {
  const { projectId } = Route.useParams();
  const { store, update, isWorkday, setPlanCells, can } = useStore();
  const project = store.projects.find((p) => p.id === projectId);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [view, setView] = useState<"month" | "year">("month");
  const [filterDept, setFilterDept] = useState("all");
  const sel = useRowSelection();
  const yearSel = useRowSelection();
  const editable = can("editProject");

  const members = useMemo(() => {
    if (!project) return [];
    const people = allPeople(store);
    let list = project.members
      .map((m) => people.find((p) => p.id === m.personId))
      .filter((p): p is NonNullable<typeof p> => !!p);
    if (filterDept !== "all") list = list.filter((p) => p.department === filterDept);
    return list.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [project, store, filterDept]);

  if (!project) {
    return (
      <div>
        <p className="text-sm text-muted-foreground">Проект не найден.</p>
        <Link to="/projects" className="text-primary underline">
          К списку проектов
        </Link>
      </div>
    );
  }

  const days = Array.from({ length: daysInMonth(year, month) }, (_, i) => i + 1);
  const depts = Array.from(new Set(members.map((m) => m.department))).sort();

  const goals: ProjectGoal[] = project.goals ?? (
    project.milestone ? [{ id: "m0", date: project.milestone, name: "Ближайшая цель" }] : []
  );
  const goalsAt = (date: string) => goals.filter((g) => g.date === date);
  const addGoal = (date: string) => {
    const name = window.prompt("Название цели проекта", "");
    if (name === null) return;
    patch((p) => {
      p.goals = [...(p.goals ?? goals), { id: `g${Date.now()}`, date, name: name || "Цель" }];
      p.milestone = date;
    });
    toast.success("Цель добавлена");
  };
  const removeGoal = (id: string) =>
    patch((p) => {
      p.goals = (p.goals ?? goals).filter((g) => g.id !== id);
    });

  const patch = (fn: (p: NonNullable<typeof project>) => void) =>
    update((d) => {
      const p = d.projects.find((x) => x.id === projectId);
      if (p) fn(p);
    });

  const setYearMonthWork = (personId: string, monthsIdx: number[], value: "Р" | null) => {
    const dates: string[] = [];
    for (const m of monthsIdx) {
      for (let d = 1; d <= daysInMonth(year, m); d++) {
        const date = iso(year, m, d);
        if (isWorkday(date)) dates.push(date);
      }
    }
    setPlanCells(projectId, personId, dates, value);
    yearSel.clear();
  };

  return (
    <div onMouseUp={sel.onMouseUp}>
      <Link
        to="/projects"
        className="mb-3 inline-flex items-center gap-2 text-xl font-semibold text-primary"
      >
        <ArrowLeft className="size-5" /> Все проекты
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{project.name}</h1>
        {(project.stages ?? []).map((s) => (
          <span
            key={s}
            className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground"
          >
            {s}
          </span>
        ))}
      </div>


      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <Label>Стадии</Label>
          <div className="mt-1 flex flex-wrap gap-1">
            {PROJECT_STAGES.map((s) => {
              const on = (project.stages ?? []).includes(s);
              return (
                <button
                  key={s}
                  disabled={!editable}
                  className={`rounded-md border px-2 py-1 text-xs ${
                    on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
                  } ${editable ? "" : "opacity-70"}`}
                  onClick={() =>
                    patch((p) => {
                      const cur = p.stages ?? [];
                      p.stages = on ? cur.filter((x) => x !== s) : [...cur, s];
                    })
                  }
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <Label>Дата начала</Label>
          <Input
            type="date"
            value={project.start}
            disabled={!editable}
            onChange={(e) => patch((p) => (p.start = e.target.value))}
          />
        </div>
        <div>
          <Label>Срок сдачи</Label>
          <Input
            type="date"
            value={project.end}
            disabled={!editable}
            onChange={(e) => patch((p) => (p.end = e.target.value))}
          />
        </div>
        <div>
          <Label>Новая цель</Label>
          <Input
            type="date"
            value=""
            disabled={!editable}
            onChange={(e) => e.target.value && addGoal(e.target.value)}
          />
        </div>
        <div>
          <Label>Пауза</Label>
          <Button
            variant="outline"
            className="mt-1 w-full"
            disabled={!editable}
            onClick={() => patch((p) => (p.paused = !p.paused))}
          >
            {project.paused ? "Снять паузу" : "Поставить на паузу"}
          </Button>
        </div>

      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {view === "month" && (
          <MonthPicker
            year={year}
            month={month}
            onChange={(y, m) => {
              setYear(y);
              setMonth(m);
            }}
          />
        )}
        <Select value={filterDept} onValueChange={setFilterDept}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Раздел" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все разделы</SelectItem>
            {depts.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => setView(view === "month" ? "year" : "month")}>
          {view === "month" ? "Вид по годам" : "Вид по месяцу"}
        </Button>
        {editable && <AddMemberDialog projectId={projectId} />}
      </div>

      <p className="mt-4 text-sm font-medium">
        План работ по проекту ·{" "}
        {view === "month" ? `${MONTHS[month]} ${year}` : `${year} год`}
      </p>

      <div className="mt-3 flex items-start gap-3">
        <div className="min-w-0 flex-1 overflow-x-auto rounded-lg border bg-card">
        {view === "month" ? (
          <table className="grid-table w-full">
            <thead>
              <tr className="bg-muted">
                <th className="sticky left-0 z-10 min-w-[220px] border-r border-b bg-muted px-3 py-2 text-left text-xs font-medium">
                  ФИО
                </th>
                <th className="min-w-[80px] border-r border-b px-2 text-xs">Раздел</th>
                {days.map((d) => {
                  const date = iso(year, month, d);
                  const dayGoals = goalsAt(date);
                  return (
                    <ContextMenu key={d}>
                      <ContextMenuTrigger asChild>
                        <th
                          className="day-cell font-medium"
                          title={
                            dayGoals.length
                              ? `Цель: ${dayGoals.map((g) => g.name).join(", ")}`
                              : editable
                                ? "ПКМ — создать цель проекта"
                                : undefined
                          }
                          style={{
                            background: isWorkday(date) ? undefined : "var(--weekend)",
                            boxShadow: dayGoals.length ? "inset 0 0 0 2px #d4a017" : undefined,
                          }}
                        >
                          <div>{d}</div>
                          <div className="text-[9px] text-muted-foreground">
                            {WEEKDAYS_SHORT[weekdayIndex(year, month, d)]}
                          </div>
                        </th>
                      </ContextMenuTrigger>
                      {editable && (
                        <ContextMenuContent>
                          <ContextMenuItem onSelect={() => addGoal(date)}>
                            + Новая цель проекта на {d}.{String(month + 1).padStart(2, "0")}
                          </ContextMenuItem>
                          {dayGoals.map((g) => (
                            <ContextMenuItem key={g.id} onSelect={() => removeGoal(g.id)}>
                              Удалить цель «{g.name}»
                            </ContextMenuItem>
                          ))}
                        </ContextMenuContent>
                      )}
                    </ContextMenu>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {members.map((p) => (
                <tr key={p.id}>
                  <th className="sticky left-0 z-10 border-r border-b bg-card px-3 py-1 text-left text-xs font-normal">
                    <PersonLink id={p.id} name={p.name} />
                  </th>
                  <td className="border-r border-b px-2 text-center text-xs">{p.department}</td>
                  {days.map((d) => {
                    const date = iso(year, month, d);
                    const rawStatus = store.timesheet[p.id]?.[date] ?? "";
                    // «ОЖ» тоже считаем отсутствием (серая ячейка)
                    const absence =
                      absenceAt(store, p.id, date) || (rawStatus === "ОЖ" ? "ОЖ" : "");
                    // Часы из табеля рабочего времени здесь не показываем
                    const status =
                      rawStatus === REMOTE_CODE || /^[\d.,]+$/.test(rawStatus) ? "" : rawStatus;
                    const active = store.projects.filter(
                      (pr) => store.plan[pr.id]?.[p.id]?.[date] === "Р",
                    );
                    const here = active.some((pr) => pr.id === projectId);
                    const dayGoals = goalsAt(date);
                    const conflict = !!absence && here;
                    let bg: string | undefined = isWorkday(date) ? undefined : "var(--weekend)";
                    if (absence) bg = "#e2e2e2";
                    if (conflict) bg = "#ffd9d9";
                    const border = conflict
                      ? "inset 0 0 0 2px #dc2626"
                      : dayGoals.length
                        ? "inset 0 0 0 2px #d4a017"
                        : undefined;
                    const selected = sel.isSelected(p.id, d);
                    return (
                      <ContextMenu key={d}>
                        <ContextMenuTrigger asChild>
                          <td
                            className="day-cell cursor-pointer align-top"
                            title={
                              [
                                conflict ? `Конфликт: ${absence} и занятость` : "",
                                here ? project.name : "",
                                dayGoals.map((g) => `Цель: ${g.name}`).join(", "),
                              ]
                                .filter(Boolean)
                                .join(" · ") || undefined
                            }

                            style={{
                              background: bg,
                              boxShadow: border,
                              outline: selected ? "2px solid var(--primary)" : undefined,
                              outlineOffset: "-2px",
                            }}
                            onMouseDown={(e) => editable && sel.onMouseDown(p.id, d, e)}
                            onMouseEnter={() => editable && sel.onMouseEnter(p.id, d)}
                            onContextMenu={() => editable && sel.ensureSelected(p.id, d)}
                          >
                            <div className="flex flex-col items-center gap-[1px] py-[1px]">
                              {status && (
                                <span className="text-[10px] leading-none font-medium">
                                  {status}
                                </span>
                              )}
                              {active
                                .filter((pr) => pr.id === projectId)
                                .map((pr) => (
                                  <PlanBar
                                    key={pr.id}
                                    color={pr.color}
                                    name={pr.name}
                                    height={6}
                                    first={
                                      d === 1 ||
                                      !isPlanned(store, pr.id, p.id, iso(year, month, d - 1))
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
                            <ContextMenuItem
                              onSelect={() => {
                                setPlanCells(
                                  projectId,
                                  p.id,
                                  sel.targetDays(p.id, d).map((x) => iso(year, month, x)),
                                  "Р",
                                );
                                sel.clear();
                              }}
                            >
                              Занять на «{project.name}»
                            </ContextMenuItem>
                            <ContextMenuItem
                              onSelect={() => {
                                setPlanCells(
                                  projectId,
                                  p.id,
                                  sel.targetDays(p.id, d).map((x) => iso(year, month, x)),
                                  null,
                                );
                                sel.clear();
                              }}
                            >
                              Снять занятость на этом проекте
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
          <table className="grid-table w-full" onMouseUp={yearSel.onMouseUp}>
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
              {members.map((p) => (
                <tr key={p.id}>
                  <th className="border-r border-b px-3 py-1 text-left text-xs font-normal">
                    <PersonLink id={p.id} name={p.name} />
                  </th>
                  {MONTHS_SHORT.map((_, m) => {
                    const busy = Array.from({ length: daysInMonth(year, m) }, (_, i) =>
                      iso(year, m, i + 1),
                    ).some((date) => store.plan[projectId]?.[p.id]?.[date] === "Р");
                    const selected = yearSel.isSelected(p.id, m);
                    return (
                      <ContextMenu key={m}>
                        <ContextMenuTrigger asChild>
                          <td
                            className="h-8 cursor-pointer border-r border-b text-center text-xs"
                            style={{
                              outline: selected ? "2px solid var(--primary)" : undefined,
                              outlineOffset: "-2px",
                            }}
                            onMouseDown={() => editable && yearSel.onMouseDown(p.id, m)}
                            onMouseEnter={() => editable && yearSel.onMouseEnter(p.id, m)}
                            onContextMenu={() => editable && yearSel.ensureSelected(p.id, m)}
                          >
                            {busy && (
                              <span
                                className="mx-auto block h-2 w-4/5 rounded-full"
                                style={{ background: project.color }}
                                title={project.name}
                              />
                            )}
                          </td>
                        </ContextMenuTrigger>
                        {editable && (
                          <ContextMenuContent>
                            <ContextMenuItem
                              onSelect={() =>
                                setYearMonthWork(p.id, yearSel.sel?.days ?? [m], "Р")
                              }
                            >
                              Занять все будни месяца
                            </ContextMenuItem>
                            <ContextMenuItem
                              onSelect={() =>
                                setYearMonthWork(p.id, yearSel.sel?.days ?? [m], null)
                              }
                            >
                              Очистить месяц
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
        )}
        </div>

        <div className="w-60 shrink-0 rounded-lg border bg-card p-3 text-xs">
          <div className="mb-2 font-medium">Цели проекта</div>
          {goals.length === 0 && (
            <p className="text-muted-foreground">
              Целей пока нет. ПКМ по номеру дня в шапке табеля — создать цель.
            </p>
          )}
          <div className="flex flex-col gap-2">
            {[...goals]
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((g) => (
                <div
                  key={g.id}
                  className="flex items-start justify-between gap-2 rounded-md border px-2 py-1"
                  style={{ boxShadow: "inset 0 0 0 2px #d4a017" }}
                >
                  <div className="min-w-0">
                    <b className="block truncate" title={g.name}>
                      {g.name}
                    </b>
                    <span className="text-muted-foreground">
                      {g.date.slice(8, 10)}.{g.date.slice(5, 7)}.{g.date.slice(0, 4)}
                    </span>
                  </div>
                  {editable && (
                    <button
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => removeGoal(g.id)}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-card px-3 py-2 text-xs">
        <span className="font-medium">Обозначения:</span>
        {PROJECT_LEGEND.map((i) => (
          <span key={i.code} className="text-muted-foreground">
            <b className="text-foreground">{i.code}</b> — {i.label}
          </span>
        ))}
        {[
          { color: "#dc2626", label: "конфликт: отсутствие и работа в один день" },
          
          { color: "#d4a017", label: "цель проекта" },
        ].map((b) => (
          <span key={b.color} className="flex items-center gap-1.5 text-muted-foreground">
            <span
              className="inline-block size-3.5 rounded-sm"
              style={{ boxShadow: `inset 0 0 0 2px ${b.color}` }}
            />
            {b.label}
          </span>
        ))}
      </div>



      <div className="mt-6">
        <Label>Краткая информация по проекту</Label>
        <Textarea
          className="mt-1 min-h-28"
          value={project.description ?? ""}
          disabled={!editable}
          placeholder="Заметки по проекту…"
          onChange={(e) => patch((p) => (p.description = e.target.value))}
        />
      </div>
    </div>
  );
}

function AddMemberDialog({ projectId }: { projectId: string }) {
  const { store, update } = useStore();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("all");
  const project = store.projects.find((p) => p.id === projectId);
  const free = allPeople(store).filter((p) => !project?.members.some((m) => m.personId === p.id));
  const allDepts = Array.from(new Set(free.map((p) => p.department))).sort();
  const people = free.filter(
    (p) =>
      (dept === "all" || p.department === dept) &&
      p.name.toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> Добавить сотрудника на проект
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Участники проекта</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            placeholder="Поиск по ФИО…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="flex-1"
          />
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Раздел" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все разделы</SelectItem>
              {allDepts.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="max-h-80 space-y-1 overflow-y-auto">

          {people.map((p) => (
            <button
              key={p.id}
              className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-accent"
              onClick={() => {
                update((d) => {
                  const pr = d.projects.find((x) => x.id === projectId);
                  pr?.members.push({ personId: p.id, kind: p.kind });
                });
                toast.success(`${p.name} добавлен на проект`);
              }}
            >
              <span>{p.name}</span>
              <span className="text-xs text-muted-foreground">
                {p.department} · {p.kind === "employee" ? "сотрудник" : "подрядчик"}
              </span>
            </button>
          ))}
          {people.length === 0 && (
            <p className="text-sm text-muted-foreground">Все уже добавлены.</p>
          )}
        </div>
        <div className="mt-2">
          <div className="mb-1 text-xs font-medium">На проекте:</div>
          <div className="flex flex-wrap gap-2">
            {project?.members.map((m) => {
              const person = allPeople(store).find((p) => p.id === m.personId);
              if (!person) return null;
              return (
                <Button
                  key={m.personId}
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    update((d) => {
                      const pr = d.projects.find((x) => x.id === projectId);
                      if (pr) pr.members = pr.members.filter((x) => x.personId !== m.personId);
                    })
                  }
                >
                  {person.name} ✕
                </Button>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
