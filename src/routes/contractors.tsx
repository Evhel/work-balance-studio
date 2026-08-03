import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { EyeOff, Eye, UserPlus } from "lucide-react";
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
import { useRowSelection } from "@/components/useRowSelection";
import { byFio, fio, useStore } from "@/lib/store";
import { MONTHS, daysInMonth, iso, WEEKDAYS_SHORT, weekdayIndex } from "@/lib/dates";
import { CODE_COLORS, CONTRACTOR_LEGEND } from "@/lib/types";

export const Route = createFileRoute("/contractors")({
  head: () => ({
    meta: [
      { title: "Табель подрядчиков — АРВ" },
      { name: "description", content: "Месячный табель занятости подрядчиков проектного бюро." },
      { property: "og:title", content: "Табель подрядчиков — АРВ" },
      {
        property: "og:description",
        content: "Месячный табель занятости подрядчиков проектного бюро.",
      },
    ],
  }),
  component: ContractorsPage,
});

const CODES = ["Б", "ОТ", "НН"];

function ContractorsPage() {
  const { store, update, isWorkday, setCells, can } = useStore();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [filterProject, setFilterProject] = useState("all");
  const sel = useRowSelection();
  const editable = can("editContractors");

  const days = Array.from({ length: daysInMonth(year, month) }, (_, i) => i + 1);
  const people = useMemo(() => {
    let list = store.contractors.filter((c) => !c.hidden);
    if (filterProject !== "all") list = list.filter((c) => c.projectId === filterProject);
    return [...list].sort(byFio);
  }, [store.contractors, filterProject]);

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
            {people.map((p) => (
              <tr key={p.id}>
                <th className="sticky left-0 z-10 border-r border-b bg-card px-3 py-1 text-left text-xs font-normal">
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      {fio(p)}
                      <span className="ml-1 text-muted-foreground">· {p.department}</span>
                    </span>
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
                  </div>
                </th>
                {days.map((d) => {
                  const date = iso(year, month, d);
                  const v = store.timesheet[p.id]?.[date] ?? "";
                  const bg = CODE_COLORS[v] ?? (isWorkday(date) ? undefined : "var(--weekend)");
                  const selected = sel.isSelected(p.id, d);
                  return (
                    <ContextMenu key={d}>
                      <ContextMenuTrigger asChild>
                        <td
                          className="day-cell cursor-pointer"
                          style={{
                            background: bg,
                            outline: selected ? "2px solid var(--primary)" : undefined,
                            outlineOffset: "-2px",
                          }}
                          onMouseDown={() => editable && sel.onMouseDown(p.id, d)}
                          onMouseEnter={() => editable && sel.onMouseEnter(p.id, d)}
                          onContextMenu={() => editable && sel.ensureSelected(p.id, d)}
                        >
                          {v}
                        </td>
                      </ContextMenuTrigger>
                      {editable && (
                        <ContextMenuContent>
                          {CODES.map((c) => (
                            <ContextMenuItem
                              key={c}
                              onSelect={() => {
                                setCells(
                                  p.id,
                                  (sel.sel?.days ?? [d]).map((x) => iso(year, month, x)),
                                  c,
                                );
                                sel.clear();
                              }}
                            >
                              {c} — {CONTRACTOR_LEGEND.find((l) => l.code === c)?.label}
                            </ContextMenuItem>
                          ))}
                          <ContextMenuSeparator />
                          <ContextMenuItem
                            onSelect={() => {
                              setCells(
                                p.id,
                                (sel.sel?.days ?? [d]).map((x) => iso(year, month, x)),
                                null,
                              );
                              sel.clear();
                            }}
                          >
                            Очистить
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

      <Legend items={CONTRACTOR_LEGEND} />

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
            <div>
              <Label>Отчество</Label>
              <Input
                value={f.middleName}
                onChange={(e) => setF({ ...f, middleName: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Отдел</Label>
              <Input
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
