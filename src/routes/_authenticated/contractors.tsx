import { createFileRoute } from "@tanstack/react-router";
import { soft } from "@/lib/colors";
import { useMemo, useState } from "react";
import { EyeOff, Eye, UserPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { PlanBar, isPlanned } from "@/components/PlanBar";
import { byFio, fio, useStore } from "@/lib/store";
import { MONTHS, daysInMonth, iso, WEEKDAYS_SHORT, weekdayIndex } from "@/lib/dates";
import { CODE_COLORS, CONTRACTOR_LEGEND, visibleMedicalItems } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/contractors")({
  head: () => ({
    meta: [
      { title: "Табель подрядчиков — ARV. Трудозатраты" },
      { name: "description", content: "Месячный табель занятости подрядчиков проектного бюро." },
      { property: "og:title", content: "Табель подрядчиков — ARV. Трудозатраты" },
      {
        property: "og:description",
        content: "Месячный табель занятости подрядчиков проектного бюро.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContractorsPage,
});

const CODES = ["Б", "Н", "ОТ", "НН"];

function ContractorsPage() {
  const {
    store,
    update,
    isWorkday,
    setCells,
    setPlanCells,
    can,
    currentUser,
    removeContractor,
  } = useStore();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [filterProject, setFilterProject] = useState("all");
  const sel = useRowSelection();
  const editable = can("editContractors");
  const canDelete = can("deleteEntities");
  const visibleCodes = CODES.filter(
    (code) => code !== (currentUser.position === "Офис-менеджер" ? "Н" : "Б"),
  );
  const visibleLegend = visibleMedicalItems(CONTRACTOR_LEGEND, currentUser.position);

  const days = Array.from({ length: daysInMonth(year, month) }, (_, i) => i + 1);
  const people = useMemo(() => {
    let list = store.contractors.filter((c) => !c.hidden);
    if (filterProject !== "all") list = list.filter((c) => c.projectId === filterProject);
    return [...list].sort(byFio);
  }, [store.contractors, filterProject]);

  const apply = (personId: string, day: number, value: string | null) => {
    setCells(
      personId,
      sel.targetDays(personId, day).map((x) => iso(year, month, x)),
      value,
    );
  };

  return (
    <div onMouseUp={sel.onMouseUp}>
      <h1 className="text-2xl font-semibold">Табель подрядчиков</h1>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <MonthPicker
          year={year}
          month={month}
          onChange={(y, m) => {
            setYear(y);
            setMonth(m);
          }}
        />
        <Select value={filterProject} onValueChange={setFilterProject}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Проект" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все проекты</SelectItem>
            {store.projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {editable && <AddContractorDialog />}
      </div>

      <p className="mt-4 text-sm font-medium">
        Табель подрядчиков АРВ {MONTHS[month]} {year}
      </p>
      {editable && (
        <p className="mt-1 text-xs text-muted-foreground">
          Выделение: протяжка мышью, Shift — диапазон, Ctrl — отдельные ячейки. ПКМ — статус и занятость на проекте.
        </p>
      )}

      <div className="mt-3 flex gap-4">
        <div className="min-w-0 flex-1 overflow-x-auto rounded-lg border bg-card">
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
            {people.map((p) => (
              <tr key={p.id}>
                <th className="sticky left-0 z-10 border-r border-b bg-card px-3 py-1 text-left text-xs font-normal">
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      <PersonLink id={p.id} name={fio(p)} />
                      <span className="ml-1 text-muted-foreground">· {p.department}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      {editable && (
                        <button
                          title="Скрыть подрядчика"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() =>
                            update((d) => {
                              const c = d.contractors.find((x) => x.id === p.id);
                              if (c) c.hidden = true;
                            })
                          }
                        >
                          <EyeOff className="size-3.5" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          title="Удалить подрядчика из системы"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            if (!window.confirm(`Удалить ${fio(p)} из системы?`)) return;
                            removeContractor(p.id);
                            toast.success("Подрядчик удалён");
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </span>
                  </div>
                </th>
                {days.map((d) => {
                  const date = iso(year, month, d);
                  const v = store.timesheet[p.id]?.[date] ?? "";
                  const active = store.projects.filter(
                    (pr) => store.plan[pr.id]?.[p.id]?.[date] === "Р",
                  );
                  const conflict = !!v && v !== "НН" && active.length > 0;
                  const bg = conflict
                    ? "#ffd9d9"
                    : (CODE_COLORS[v] ?? (isWorkday(date) ? undefined : "var(--weekend)"));
                  const selected = sel.isSelected(p.id, d);
                  return (
                    <ContextMenu key={d}>
                      <ContextMenuTrigger asChild>
                        <td
                          className="day-cell cursor-pointer align-top"
                          title={active.map((x) => x.name).join(", ") || undefined}
                          style={{
                            background: bg,
                            boxShadow: conflict ? "inset 0 0 0 2px #dc2626" : undefined,
                            outline: selected ? "2px solid var(--primary)" : undefined,
                            outlineOffset: "-2px",
                          }}
                          onMouseDown={(e) => editable && sel.onMouseDown(p.id, d, e)}
                          onMouseEnter={() => editable && sel.onMouseEnter(p.id, d)}
                          onContextMenu={() => editable && sel.ensureSelected(p.id, d)}
                        >
                          <div className="flex flex-col items-center gap-[1px] py-[1px]">
                            {v && <span className="text-[10px] leading-none font-medium">{v}</span>}
                            {active.map((pr) => (
                              <PlanBar
                                key={pr.id}
                                color={pr.color}
                                name={pr.name}
                                first={d === 1 || !isPlanned(store, pr.id, p.id, iso(year, month, d - 1))}
                                last={d === days.length || !isPlanned(store, pr.id, p.id, iso(year, month, d + 1))}
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
                                  sel.targetDays(p.id, d).map((x) => iso(year, month, x)),
                                  "Р",
                                );
                                sel.clear();
                              }}
                            >
                              Занять: {pr.name}
                            </ContextMenuItem>
                          ))}
                          <ContextMenuItem
                            onSelect={() => {
                              const dates = sel.targetDays(p.id, d).map((x) => iso(year, month, x));
                              store.projects.forEach((pr) => setPlanCells(pr.id, p.id, dates, null));
                              sel.clear();
                            }}
                          >
                            Снять занятость
                          </ContextMenuItem>
                          <ContextMenuSeparator />
                          {visibleCodes.map((c) => (
                            <ContextMenuItem key={c} onSelect={() => apply(p.id, d, c)}>
                              {c} — {CONTRACTOR_LEGEND.find((l) => l.code === c)?.label}
                            </ContextMenuItem>
                          ))}
                          <ContextMenuSeparator />
                          <ContextMenuItem onSelect={() => apply(p.id, d, null)}>
                            Очистить статус
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
          {store.projects.map((p) => (
            <div key={p.id} className="mb-1 flex items-center gap-2">
              <span className="size-3 shrink-0 rounded-full" style={{ background: soft(p.color) }} />
              <span className="truncate">{p.name}</span>
            </div>
          ))}
        </div>
      </div>

      <Legend items={visibleLegend} />

      {editable && store.contractors.some((c) => c.hidden) && (
        <div className="mt-4 rounded-lg border bg-card p-3 text-sm">
          <div className="mb-2 font-medium">Скрытые подрядчики</div>
          <div className="flex flex-wrap gap-2">
            {store.contractors
              .filter((c) => c.hidden)
              .map((c) => (
                <Button
                  key={c.id}
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    update((d) => {
                      const x = d.contractors.find((z) => z.id === c.id);
                      if (x) x.hidden = false;
                    })
                  }
                >
                  <Eye className="size-3.5" /> {fio(c)}
                </Button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AddContractorDialog() {
  const { store, update } = useStore();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    lastName: "",
    firstName: "",
    middleName: "",
    department: "",
    projectId: "",
  });
  const departments = Array.from(
    new Set([
      ...store.employees.map((e) => e.department),
      ...store.contractors.map((c) => c.department),
    ]),
  )
    .filter(Boolean)
    .sort();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="size-4" /> Добавить нового подрядчика
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Новый подрядчик</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>Фамилия</Label>
              <Input value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} />
            </div>
            <div>
              <Label>Имя</Label>
              <Input
                value={f.firstName}
                onChange={(e) => setF({ ...f, firstName: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Отдел</Label>
              {departments.length > 0 && (
                <Select
                  value={departments.includes(f.department) ? f.department : ""}
                  onValueChange={(v) => setF({ ...f, department: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите из существующих" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Input
                className="mt-1"
                placeholder="или введите новый отдел"
                value={f.department}
                onChange={(e) => setF({ ...f, department: e.target.value })}
              />
            </div>
            <div>
              <Label>Проект</Label>
              <Select value={f.projectId} onValueChange={(v) => setF({ ...f, projectId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите" />
                </SelectTrigger>
                <SelectContent>
                  {store.projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              if (!f.lastName || !f.firstName) {
                toast.error("Укажите фамилию и имя");
                return;
              }
              update((d) => d.contractors.push({ id: `c${Date.now()}`, ...f }));
              toast.success("Подрядчик добавлен");
              setOpen(false);
              setF({ lastName: "", firstName: "", middleName: "", department: "", projectId: "" });
            }}
          >
            Добавить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
