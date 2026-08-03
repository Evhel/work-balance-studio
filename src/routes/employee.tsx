import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
import { byFio, fio, useStore } from "@/lib/store";
import { absenceAt } from "@/lib/people";
import { MONTHS, daysInMonth, iso, WEEKDAYS_SHORT, weekdayIndex } from "@/lib/dates";

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
  { code: "Б", label: "больничный лист (серое)" },
  { code: "ОТ", label: "отпуск оплачиваемый (серое)" },
  { code: "ДО", label: 'отпуск "за свой счет" (серое)' },
  { code: "У", label: "учебный отпуск (серое)" },
];

function EmployeePage() {
  const { store, update, isWorkday, setPlanCells, currentUser, can } = useStore();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const employees = [...store.employees.filter((e) => !e.hidden)].sort(byFio);
  const [personId, setPersonId] = useState(currentUser?.id ?? employees[0]?.id ?? "");
  const person = store.employees.find((e) => e.id === personId) ?? employees[0];
  const editable = can("editDepartment");
  const isSelf = person?.id === currentUser?.id;

  if (!person) return <p>Нет сотрудников</p>;

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
    <div>
      <h1 className="text-2xl font-semibold">Сотрудник</h1>

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
        <MonthPicker
          year={year}
          month={month}
          onChange={(y, m) => {
            setYear(y);
            setMonth(m);
          }}
        />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Avatar className="size-14">
          <AvatarImage src={person.avatar} alt={fio(person)} />
          <AvatarFallback>
            {person.lastName[0]}
            {person.firstName[0]}
          </AvatarFallback>
        </Avatar>
        <div>
          <h2 className="text-lg font-medium">{fio(person)}</h2>
          <p className="text-sm text-muted-foreground">
            {person.position} · {person.department} ·{" "}
            {person.fullTime ? "полный день" : "неполный день"}
          </p>
        </div>
        {isSelf && (
          <div className="ml-4">
            <Label className="text-xs">Аватар</Label>
            <Input
              type="file"
              accept="image/*"
              className="w-56"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () =>
                  update((d) => {
                    const p = d.employees.find((x) => x.id === person.id);
                    if (p) p.avatar = String(reader.result);
                  });
                reader.readAsDataURL(file);
              }}
            />
          </div>
        )}
      </div>

      <p className="mt-5 text-sm font-medium">
        {MONTHS[month]} {year}
      </p>

      <div className="mt-3 flex gap-4">
        <div className="min-w-0 flex-1 overflow-hidden rounded-lg border bg-card">
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
              const active = store.projects.filter(
                (pr) => store.plan[pr.id]?.[person.id]?.[date] === "Р",
              );
              const event = store.personalEvents[person.id]?.[date];
              return (
                <ContextMenu key={i}>
                  <ContextMenuTrigger asChild>
                    <div
                      className="min-h-24 border-r border-b p-1 text-xs last:border-r-0"
                      style={{
                        background: absence
                          ? "#e2e2e2"
                          : isWorkday(date)
                            ? undefined
                            : "var(--weekend)",
                      }}
                    >
                      <div className="mb-1 font-medium">{d}</div>
                      {absence && <div className="mb-1 font-medium">{absence}</div>}
                      {active.map((pr) => (
                        <div
                          key={pr.id}
                          className="mb-0.5 truncate rounded px-1 py-0.5 text-[10px] text-white"
                          style={{ background: pr.color }}
                          title={pr.name}
                        >
                          {pr.name}
                        </div>
                      ))}
                      {event && (
                        <div className="mb-0.5 truncate rounded border border-dashed px-1 py-0.5 text-[10px]">
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
                          onSelect={() => setPlanCells(pr.id, person.id, [date], "Р")}
                        >
                          Занять: {pr.name}
                        </ContextMenuItem>
                      ))}
                    {editable && (
                      <>
                        <ContextMenuItem
                          onSelect={() =>
                            store.projects.forEach((pr) =>
                              setPlanCells(pr.id, person.id, [date], null),
                            )
                          }
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
                          if (t) dd.personalEvents[person.id]![date] = t;
                          else delete dd.personalEvents[person.id]![date];
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
