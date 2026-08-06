import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { Download, Upload, UserPlus, EyeOff, Eye, FileSpreadsheet, Trash2 } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { MonthPicker, Legend } from "@/components/MonthPicker";
import { PersonLink } from "@/components/PersonLink";
import { useRowSelection } from "@/components/useRowSelection";
import { byFio, fio, useStore } from "@/lib/store";
import { isEmployedOn } from "@/lib/people";
import { MONTHS, daysInMonth, iso, todayIso, WEEKDAYS_SHORT, weekdayIndex } from "@/lib/dates";
import {
  CODE_COLORS,
  POSITIONS,
  REMOTE_CODE,
  TIME_CODES,
  TIME_LEGEND,
  type Position,
} from "@/lib/types";
import {
  downloadMonth,
  downloadTemplate,
  downloadRowTemplate,
  parseImport,
  type ExportRow,
} from "@/lib/excel";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Табель рабочего времени — АРВ" },
      {
        name: "description",
        content: "Месячный табель учёта рабочего времени сотрудников проектного бюро.",
      },
      { property: "og:title", content: "Табель рабочего времени — АРВ" },
      {
        property: "og:description",
        content: "Месячный табель учёта рабочего времени сотрудников проектного бюро.",
      },
    ],
  }),
  component: TimesheetPage,
});

function TimesheetPage() {
  const { store, update, isWorkday, toggleDay, setCells, can, removeEmployee } = useStore();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [filterDept, setFilterDept] = useState("all");
  const [filterProject, setFilterProject] = useState("all");
  const [hideRemote, setHideRemote] = useState(false);
  const [hideHours, setHideHours] = useState(false);
  const [edit, setEdit] = useState<{ personId: string; day: number; value: string } | null>(null);
  const sel = useRowSelection();
  const editable = can("editTimesheet");
  const canDelete = can("deleteEntities");
  const fileRef = useRef<HTMLInputElement>(null);
  const today = todayIso();

  const dim = daysInMonth(year, month);
  const days = Array.from({ length: dim }, (_, i) => i + 1);
  const normDays = days.filter((d) => isWorkday(iso(year, month, d))).length;

  const departments = useMemo(
    () => Array.from(new Set(store.employees.map((e) => e.department))).sort(),
    [store.employees],
  );

  const people = useMemo(() => {
    let list = store.employees.filter((e) => !e.hidden);
    if (filterDept !== "all") list = list.filter((e) => e.department === filterDept);
    if (filterProject !== "all") {
      const p = store.projects.find((x) => x.id === filterProject);
      const ids = new Set(p?.members.map((m) => m.personId) ?? []);
      list = list.filter((e) => ids.has(e.id));
    }
    return [...list].sort(byFio);
  }, [store.employees, store.projects, filterDept, filterProject]);

  /** Регулярная удалёнка сотрудника на эту дату */
  const remoteByPattern = (emp: { remoteDays?: number[] } | undefined, date: string) => {
    if (!emp?.remoteDays?.length) return false;
    const [yy, mm, dd] = date.split("-").map(Number);
    const wd = weekdayIndex(yy!, mm! - 1, dd!); // 0 — Пн
    return wd < 5 && emp.remoteDays.includes(wd + 1);
  };

  /** Статусы, при которых «УД» не ставится */
  const NON_REMOTE_CODES = ["Б", "ОТ", "ДО", "НН", "ОЖ", "У"];

  /** Удалёнка на дату: ручное переопределение важнее регулярного паттерна */
  const remoteAt = (personId: string, date: string) => {
    const emp = store.employees.find((e) => e.id === personId);
    if (!emp || !isWorkday(date) || !isEmployedOn(emp, date)) return false;
    const manual = store.timesheet[personId]?.[date];
    if (manual && NON_REMOTE_CODES.includes(manual)) return false;
    const ov = store.remoteOverride?.[personId]?.[date];
    if (typeof ov === "boolean") return ov;
    if (manual === REMOTE_CODE) return true;
    return remoteByPattern(emp, date);
  };


  const setRemote = (personId: string, dayList: number[], value: boolean | null) =>
    update((d) => {
      d.remoteOverride[personId] = d.remoteOverride[personId] ?? {};
      for (const day of dayList) {
        const date = iso(year, month, day);
        // «УД», сохранённая как значение ячейки, больше не используется
        if (d.timesheet[personId]?.[date] === REMOTE_CODE) delete d.timesheet[personId]![date];
        if (value === null) delete d.remoteOverride[personId]![date];
        else d.remoteOverride[personId]![date] = value;
      }
    });

  /** Часы или буквенный статус ячейки (без «УД») */
  const cellValue = (personId: string, day: number) => {
    const date = iso(year, month, day);
    const manual = store.timesheet[personId]?.[date];
    if (manual !== undefined && manual !== REMOTE_CODE) return manual;
    const emp = store.employees.find((e) => e.id === personId);
    if (!emp || !isWorkday(date) || !isEmployedOn(emp, date)) return "";
    if (emp.fullTime && date <= today) return "8";
    return "";
  };

  /** Значение с учётом кнопок «Скрыть удалёнку» / «Скрыть часы» */
  const shown = (v: string) => {
    if (hideRemote && v === REMOTE_CODE) return "";
    if (hideHours && v !== "" && !Number.isNaN(Number(v))) return "";
    return v;
  };

  const rowTotals = (personId: string) => {
    let hours = 0;
    let workdays = 0;
    for (const d of days) {
      const v = cellValue(personId, d);
      const n = Number(v);
      if (v !== "" && !Number.isNaN(n)) {
        hours += n;
        if (n > 0) workdays += 1;
      } else if (v === "" && remoteAt(personId, iso(year, month, d))) {
        workdays += 1;
      }
    }
    return { hours, workdays };
  };


  const applyStatus = (personId: string, dayList: number[], value: string | null) => {
    setCells(personId, dayList.map((d) => iso(year, month, d)), value);
  };

  const commitEdit = () => {
    if (!edit) return;
    const days = sel.targetDays(edit.personId, edit.day);
    applyStatus(edit.personId, days, edit.value === "" ? null : edit.value);
    setEdit(null);
  };

  const onCellKeyDown = (e: React.KeyboardEvent, personId: string, day: number) => {
    if (!editable) return;
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      setEdit((prev) =>
        prev && prev.personId === personId && prev.day === day
          ? { personId, day, value: (prev.value + e.key).slice(0, 2) }
          : { personId, day, value: e.key },
      );
      return;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      commitEdit();
      return;
    }
    if (e.key === "Escape") {
      setEdit(null);
      return;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      setEdit(null);
      applyStatus(personId, sel.targetDays(personId, day), null);
    }
  };

  const exportRows = (y: number, m: number): ExportRow[] => {
    const dm = daysInMonth(y, m);
    return people.map((p) => {
      const values: string[] = [];
      let hours = 0;
      let wd = 0;
      for (let d = 1; d <= dm; d++) {
        const date = iso(y, m, d);
        const employed = isWorkday(date) && isEmployedOn(p, date);
        const manual = store.timesheet[p.id]?.[date];
        let v = manual !== undefined && manual !== REMOTE_CODE ? manual : "";
        if (manual === undefined && employed && p.fullTime && date <= today) v = "8";
        const ov = store.remoteOverride?.[p.id]?.[date];
        const remote =
          employed &&
          !(manual && NON_REMOTE_CODES.includes(manual)) &&
          (typeof ov === "boolean" ? ov : manual === REMOTE_CODE || remoteByPattern(p, date));

        const n = Number(v);
        if (v !== "" && !Number.isNaN(n)) {
          hours += n;
          if (n > 0) wd += 1;
        } else if (v === "" && remote) {
          wd += 1;
        }
        const cell = [shown(v), remote ? shown(REMOTE_CODE) : ""].filter(Boolean).join(" ");
        values.push(cell);
      }

      return { fio: fio(p), values, hours, days: wd };
    });
  };

  const handleImport = async (file: File) => {
    try {
      const cells = await parseImport(file);
      if (!cells.length) {
        toast.error("В файле не найдено данных табеля");
        return;
      }
      update((d) => {
        for (const c of cells) {
          const emp = d.employees.find((e) => fio(e) === c.fio);
          if (!emp) continue;
          d.timesheet[emp.id] = d.timesheet[emp.id] ?? {};
          d.timesheet[emp.id]![c.date] = c.value;
        }
      });
      toast.success(`Импортировано значений: ${cells.length}`);
    } catch {
      toast.error("Не удалось прочитать файл");
    }
  };

  return (
    <div onMouseUp={sel.onMouseUp}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold">Табель рабочего времени</h1>
        <div className="flex flex-wrap gap-2">
          <ExportDialog
            year={year}
            month={month}
            onExport={(list) => {
              list.forEach(({ y, m }, i) => {
                const nd = Array.from({ length: daysInMonth(y, m) }, (_, k) => k + 1).filter((d) =>
                  isWorkday(iso(y, m, d)),
                ).length;
                // Каждый месяц — отдельный файл; небольшая задержка,
                // чтобы браузер не блокировал серию скачиваний.
                window.setTimeout(() => downloadMonth(y, m, exportRows(y, m), nd), i * 400);
              });
              toast.success(
                list.length > 1
                  ? `Скачивается файлов: ${list.length} (по одному на месяц)`
                  : "Файл скачивается",
              );
            }}
          />

          <Button
            variant="outline"
            onClick={() => {
              downloadTemplate(year, month, people.map(fio), normDays);
              toast.success("Шаблон скачан");
            }}
          >
            <FileSpreadsheet className="size-4" /> Шаблон (табличный)
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              downloadRowTemplate(year, month, people.map(fio));
              toast.success("Построчный шаблон скачан");
            }}
            title="Построчный формат: ФИО / Дата / Значение — удобно для массовой загрузки"
          >
            <FileSpreadsheet className="size-4" /> Шаблон (построчный)
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" /> Импорт
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            multiple
            className="hidden"
            onChange={(e) => {
              Array.from(e.target.files ?? []).forEach(handleImport);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <MonthPicker
          year={year}
          month={month}
          onChange={(y, m) => {
            setYear(y);
            setMonth(m);
          }}
        />
        <Select value={filterDept} onValueChange={setFilterDept}>
          <SelectTrigger className="w-[180px]">
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
        {editable && <AddEmployeeDialog departments={departments} />}
        <Button
          variant={hideRemote ? "default" : "outline"}
          onClick={() => setHideRemote((v) => !v)}
          title="Скрывает статус «УД» в таблице и при экспорте"
        >
          {hideRemote ? "Показать удалёнку" : "Скрыть удалёнку"}
        </Button>
        <Button
          variant={hideHours ? "default" : "outline"}
          onClick={() => setHideHours((v) => !v)}
          title="Скрывает часы в таблице и при экспорте"
        >
          {hideHours ? "Показать часы" : "Скрыть часы"}
        </Button>
      </div>

      <p className="mt-4 text-sm font-medium">
        Табель АРВ {MONTHS[month]} {year} (норма {normDays} р.д./{normDays * 8} ч)
      </p>
      {editable && (
        <p className="mt-1 text-xs text-muted-foreground">
          Выделение: протяжка мышью, Shift — диапазон, Ctrl — отдельные ячейки. Часы можно вводить
          прямо с клавиатуры, Enter — применить, Delete — очистить.
        </p>
      )}

      <div className="mt-3 overflow-x-auto rounded-lg border bg-card">
        <table className="grid-table w-full">
          <thead>
            <tr className="bg-muted">
              <th className="sticky left-0 z-10 min-w-[230px] border-r border-b bg-muted px-3 py-2 text-left text-xs font-medium">
                ФИО
              </th>
              {days.map((d) => {
                const date = iso(year, month, d);
                const work = isWorkday(date);
                return (
                  <ContextMenu key={d}>
                    <ContextMenuTrigger asChild>
                      <th
                        className="day-cell font-medium"
                        style={{ background: work ? undefined : "var(--weekend)" }}
                        title={editable ? "ПКМ — изменить статус дня" : undefined}
                      >
                        <div>{d}</div>
                        <div className="text-[9px] text-muted-foreground">
                          {WEEKDAYS_SHORT[weekdayIndex(year, month, d)]}
                        </div>
                      </th>
                    </ContextMenuTrigger>
                    {editable && (
                      <ContextMenuContent>
                        <ContextMenuItem onSelect={() => toggleDay(date)}>
                          Сделать {work ? "выходным" : "рабочим"}
                        </ContextMenuItem>
                      </ContextMenuContent>
                    )}
                  </ContextMenu>
                );
              })}
              <th className="min-w-[56px] border-r border-b px-2 text-xs">часы</th>
              <th className="min-w-[56px] border-b px-2 text-xs">р.дни</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const t = rowTotals(p.id);
              return (
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
                            className="text-muted-foreground hover:text-destructive"
                            title="Скрыть (уволить)"
                            onClick={() =>
                              update((d) => {
                                const e = d.employees.find((x) => x.id === p.id);
                                if (e) e.hidden = true;
                              })
                            }
                          >
                            <EyeOff className="size-3.5" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            className="text-muted-foreground hover:text-destructive"
                            title="Удалить сотрудника из системы"
                            onClick={() => {
                              if (!window.confirm(`Удалить ${fio(p)} из системы?`)) return;
                              removeEmployee(p.id);
                              toast.success("Сотрудник удалён");
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
                    const work = isWorkday(date);
                    const isEditing = edit?.personId === p.id && edit.day === d;
                    const raw = isEditing ? edit.value : cellValue(p.id, d);
                    const v = isEditing ? raw : shown(raw);
                    const remote = !hideRemote && remoteAt(p.id, date);
                    const bg =
                      CODE_COLORS[v] ??
                      (remote ? CODE_COLORS[REMOTE_CODE] : undefined) ??
                      (work ? undefined : "var(--weekend)");
                    const selected = sel.isSelected(p.id, d);
                    return (
                      <ContextMenu key={d}>
                        <ContextMenuTrigger asChild>
                          <td
                            className="day-cell cursor-pointer outline-none"
                            tabIndex={editable ? 0 : undefined}
                            style={{
                              background: bg,
                              outline: isEditing
                                ? "2px solid var(--destructive)"
                                : selected
                                  ? "2px solid var(--primary)"
                                  : undefined,
                              outlineOffset: "-2px",
                            }}
                            onMouseDown={(e) => editable && sel.onMouseDown(p.id, d, e)}
                            onMouseEnter={() => editable && sel.onMouseEnter(p.id, d)}
                            onContextMenu={() => editable && sel.ensureSelected(p.id, d)}
                            onKeyDown={(e) => onCellKeyDown(e, p.id, d)}
                            onBlur={() => isEditing && commitEdit()}
                            title={remote ? "Удалённая работа" : undefined}
                          >
                            <span className="flex flex-col items-center leading-none">
                              <span>{v}</span>
                              {remote && (
                                <span className="text-[8px] font-medium text-primary">
                                  {REMOTE_CODE}
                                </span>
                              )}
                            </span>
                          </td>
                        </ContextMenuTrigger>
                        {editable && (
                          <ContextMenuContent>
                            {TIME_CODES.filter((c) => c !== REMOTE_CODE).map((c) => (
                              <ContextMenuItem
                                key={c}
                                onSelect={() => applyStatus(p.id, sel.targetDays(p.id, d), c)}
                              >
                                {c} — {TIME_LEGEND.find((l) => l.code === c)?.label}
                              </ContextMenuItem>
                            ))}
                            <ContextMenuSeparator />
                            <ContextMenuItem
                              onSelect={() => setRemote(p.id, sel.targetDays(p.id, d), true)}
                            >
                              Поставить «УД» (удалёнка)
                            </ContextMenuItem>
                            <ContextMenuItem
                              onSelect={() => setRemote(p.id, sel.targetDays(p.id, d), false)}
                            >
                              Убрать «УД» (в т.ч. регулярную)
                            </ContextMenuItem>
                            <ContextMenuItem
                              onSelect={() => setRemote(p.id, sel.targetDays(p.id, d), null)}
                            >
                              «УД» по профилю сотрудника
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                            {["4", "8", "10", "12"].map((h) => (
                              <ContextMenuItem
                                key={h}
                                onSelect={() => applyStatus(p.id, sel.targetDays(p.id, d), h)}
                              >
                                {h} ч
                              </ContextMenuItem>
                            ))}
                            <ContextMenuItem
                              onSelect={() => {
                                const val = window.prompt("Введите количество часов", v || "8");
                                if (val !== null) applyStatus(p.id, sel.targetDays(p.id, d), val);
                              }}
                            >
                              Ввести часы вручную…
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                            <ContextMenuItem
                              onSelect={() => applyStatus(p.id, sel.targetDays(p.id, d), null)}
                            >
                              Очистить часы
                            </ContextMenuItem>
                          </ContextMenuContent>
                        )}

                      </ContextMenu>
                    );
                  })}
                  <td className="border-r border-b text-center text-xs font-medium">{t.hours}</td>
                  <td className="border-b text-center text-xs font-medium">{t.workdays}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Legend items={hideRemote ? TIME_LEGEND.filter((l) => l.code !== REMOTE_CODE) : TIME_LEGEND} />

      {editable && store.employees.some((e) => e.hidden) && (
        <div className="mt-4 rounded-lg border bg-card p-3 text-sm">
          <div className="mb-2 font-medium">Скрытые сотрудники</div>
          <div className="flex flex-wrap gap-2">
            {store.employees
              .filter((e) => e.hidden)
              .map((e) => (
                <Button
                  key={e.id}
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    update((d) => {
                      const x = d.employees.find((z) => z.id === e.id);
                      if (x) x.hidden = false;
                    })
                  }
                >
                  <Eye className="size-3.5" /> {fio(e)}
                </Button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ExportDialog({
  year,
  month,
  onExport,
}: {
  year: number;
  month: number;
  onExport: (list: { y: number; m: number }[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(`${year}-${String(month + 1).padStart(2, "0")}`);
  const [to, setTo] = useState(`${year}-${String(month + 1).padStart(2, "0")}`);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Download className="size-4" /> Экспорт
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Экспорт табеля в Excel</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>С месяца</Label>
            <Input type="month" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label>По месяц</Label>
            <Input type="month" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Каждый месяц выгружается в отдельный файл «АРВ_Табель_Год_Месяц» с форматированием и
          границами таблицы.
        </p>
        <DialogFooter>
          <Button
            onClick={() => {
              const [fy, fm] = from.split("-").map(Number);
              const [ty, tm] = to.split("-").map(Number);
              const list: { y: number; m: number }[] = [];
              const cur = new Date(fy!, fm! - 1, 1);
              const end = new Date(ty!, tm! - 1, 1);
              while (cur <= end && list.length < 36) {
                list.push({ y: cur.getFullYear(), m: cur.getMonth() });
                cur.setMonth(cur.getMonth() + 1);
              }
              onExport(list);
              setOpen(false);
            }}
          >
            Выгрузить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddEmployeeDialog({ departments }: { departments: string[] }) {
  const { update } = useStore();
  const [open, setOpen] = useState(false);
  const empty = {
    lastName: "",
    firstName: "",
    middleName: "",
    department: "",
    position: "Сотрудник" as Position,
    fullTime: true,
    birthDate: "",
    startWork: "",
    endWork: "",
  };
  const [f, setF] = useState(empty);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="size-4" /> Добавить нового сотрудника
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Новый сотрудник</DialogTitle>
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
              <Label>Должность</Label>
              <Select
                value={f.position}
                onValueChange={(v) => setF({ ...f, position: v as Position })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POSITIONS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>Дата рождения (ДД.ММ)</Label>
              <Input
                placeholder="дд.мм"
                value={
                  f.birthDate ? `${f.birthDate.slice(8, 10)}.${f.birthDate.slice(5, 7)}` : ""
                }
                onChange={(e) => {
                  const m = e.target.value.match(/^(\d{1,2})[.\/-](\d{1,2})$/);
                  if (!m) {
                    setF({ ...f, birthDate: "" });
                    return;
                  }
                  setF({
                    ...f,
                    birthDate: `2000-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`,
                  });
                }}
              />
            </div>

            <div>
              <Label>Дата начала работы</Label>
              <Input
                type="date"
                value={f.startWork}
                onChange={(e) => setF({ ...f, startWork: e.target.value })}
              />
            </div>
            <div>
              <Label>Дата конца работы</Label>
              <Input
                type="date"
                value={f.endWork}
                onChange={(e) => setF({ ...f, endWork: e.target.value })}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={f.fullTime}
              onCheckedChange={(v) => setF({ ...f, fullTime: v })}
              id="ft"
            />
            <Label htmlFor="ft">
              {f.fullTime ? "Полный рабочий день" : "Неполный рабочий день"}
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              if (!f.lastName || !f.firstName) {
                toast.error("Укажите фамилию и имя");
                return;
              }
              update((d) => d.employees.push({ id: `e${Date.now()}`, ...f }));
              toast.success("Сотрудник добавлен");
              setOpen(false);
              setF(empty);
            }}
          >
            Добавить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
