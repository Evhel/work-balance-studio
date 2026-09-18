import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { Download, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MonthPicker } from "@/components/MonthPicker";
import { PersonLink } from "@/components/PersonLink";
import { byFio, fio, useStore } from "@/lib/store";
import { MONTHS, MONTHS_SHORT, daysInMonth, iso, WEEKDAYS_SHORT, weekdayIndex } from "@/lib/dates";
import { effortRows, isEffortDone, rowTotal, workTypeSuggestions, ymKey } from "@/lib/effort";
import {
  downloadEffort,
  downloadEffortRowTemplate,
  parseEffortImport,
  parseEffortRowImport,
  type EffortExportRow,
} from "@/lib/excel";
import type { EffortRow } from "@/lib/types";

export const Route = createFileRoute("/effort")({
  head: () => ({
    meta: [
      { title: "Трудозатраты — ARV. Трудозатораты" },
      {
        name: "description",
        content: "Фактические трудозатраты сотрудников по проектам и видам работ по дням месяца.",
      },
      { property: "og:title", content: "Трудозатраты — ARV. Трудозатораты" },
      {
        property: "og:description",
        content: "Фактические трудозатраты по проектам и видам работ по дням месяца.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EffortPage,
});

function EffortPage() {
  const { store, update, isWorkday, currentUser, can } = useStore();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [gridYear, setGridYear] = useState(now.getFullYear());
  const employees = useMemo(
    () =>
      [...store.employees.filter((e) => !e.hidden && e.trackEffort !== false)].sort(byFio),
    [store.employees],
  );
  const [personId, setPersonId] = useState(currentUser?.id ?? employees[0]?.id ?? "");
  /** Подсветка строки и столбца под курсором */
  const [hoverCell, setHoverCell] = useState<{ row: string; col: number } | null>(null);
  const HOVER_TINT = "inset 0 0 0 999px rgba(82, 0, 153, 0.07)";
  const person = employees.find((e) => e.id === personId) ?? employees[0];
  const fileRef = useRef<HTMLInputElement>(null);
  const bulkRef = useRef<HTMLInputElement>(null);

  const ym = ymKey(year, month);
  const dim = daysInMonth(year, month);
  const days = Array.from({ length: dim }, (_, i) => i + 1);

  const rows = person ? effortRows(store, person.id, ym) : [];
  const suggestions = person ? workTypeSuggestions(store, person.id) : [];
  /** Заполнять можно только свою страницу (либо при праве редактировать всех) */
  const editable = !!person && (person.id === currentUser?.id || can("editEffort"));

  if (!person) return <p>Нет сотрудников</p>;

  const patchRows = (fn: (list: EffortRow[]) => EffortRow[]) =>
    update((d) => {
      d.effort[person.id] = d.effort[person.id] ?? {};
      d.effort[person.id]![ym] = fn([...(d.effort[person.id]![ym] ?? [])]);
    });

  const list: EffortRow[] = rows.length
    ? rows
    : [{ id: "new", projectId: "", workType: "", hours: {} }];

  const ensureRows = () => {
    if (!rows.length) patchRows(() => [{ id: `r${Date.now()}`, projectId: "", workType: "", hours: {} }]);
  };

  const setRow = (rowId: string, fn: (r: EffortRow) => void) =>
    patchRows((l) => {
      const next = l.length ? l : [{ id: `r${Date.now()}`, projectId: "", workType: "", hours: {} }];
      const target = next.find((r) => r.id === rowId) ?? next[0]!;
      fn(target);
      return next;
    });

  const dayTotal = (d: number) =>
    list.reduce((a, r) => a + (Number(r.hours[String(d)]) || 0), 0);
  const grandTotal = list.reduce((a, r) => a + rowTotal(r), 0);

  const done = isEffortDone(store, person.id, ym);

  const exportRows: EffortExportRow[] = list.map((r) => ({
    project: store.projects.find((p) => p.id === r.projectId)?.name ?? "",
    workType: r.workType,
    values: days.map((d) => (r.hours[String(d)] === undefined ? "" : Number(r.hours[String(d)]))),
  }));

  const handleImport = async (file: File) => {
    try {
      const imported = await parseEffortImport(file);
      if (!imported.length) {
        toast.error("В файле не найдено строк трудозатрат");
        return;
      }
      patchRows(() =>
        imported.map((r, i) => ({
          id: `i${Date.now()}_${i}`,
          projectId: store.projects.find((p) => p.name === r.project)?.id ?? "",
          workType: r.workType,
          hours: r.hours,
        })),
      );
      toast.success(`Импортировано строк: ${imported.length}`);
    } catch {
      toast.error("Не удалось прочитать файл");
    }
  };

  /** Массовый построчный импорт: сразу много сотрудников и месяцев */
  const handleBulkImport = async (file: File) => {
    try {
      const recs = await parseEffortRowImport(file);
      if (!recs.length) {
        toast.error("В файле не найдено строк (нужны колонки ФИО, Дата, Проект, Вид работ, Часы)");
        return;
      }
      const byName = new Map(employees.map((e) => [fio(e).toLowerCase(), e.id]));
      const byProject = new Map(store.projects.map((p) => [p.name.toLowerCase(), p.id]));
      let ok = 0;
      const skipped = new Set<string>();
      update((d) => {
        for (const r of recs) {
          const pid = byName.get(r.fio.trim().toLowerCase());
          const projectId = byProject.get(r.project.trim().toLowerCase());
          if (!pid || !projectId) {
            skipped.add(!pid ? r.fio : r.project);
            continue;
          }
          const key = r.date.slice(0, 7);
          const day = String(Number(r.date.slice(8, 10)));
          d.effort[pid] = d.effort[pid] ?? {};
          const rows = (d.effort[pid]![key] = d.effort[pid]![key] ?? []);
          let row = rows.find(
            (x) => x.projectId === projectId && (x.workType || "") === (r.workType || ""),
          );
          if (!row) {
            row = {
              id: `b${Date.now()}_${rows.length}_${Math.random().toString(36).slice(2, 7)}`,
              projectId,
              workType: r.workType,
              hours: {},
            };
            rows.push(row);
          }
          row.hours[day] = (Number(row.hours[day]) || 0) + r.hours;
          ok++;
        }
      });
      toast.success(
        `Загружено строк: ${ok}${skipped.size ? `, не распознано: ${[...skipped].slice(0, 3).join(", ")}` : ""}`,
      );
    } catch {
      toast.error("Не удалось прочитать файл");
    }
  };


  return (
    <div>
      <h1 className="text-2xl font-semibold">Трудозатраты</h1>

      {/* Выбор сотрудника и периода */}
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
        <label className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm">
          <Checkbox
            checked={done}
            disabled={!editable}
            onCheckedChange={(v) =>
              update((d) => {
                d.effortDone[person.id] = d.effortDone[person.id] ?? {};
                d.effortDone[person.id]![ym] = !!v;
              })
            }
          />
          Трудозатраты заполнены
        </label>
        <Button
          variant="outline"
          onClick={() => {
            downloadEffort(year, month, fio(person), exportRows);
            toast.success("Файл скачивается");
          }}
        >
          <Download className="size-4" /> Экспорт
        </Button>
        <Button variant="outline" disabled={!editable} onClick={() => fileRef.current?.click()}>
          <Upload className="size-4" /> Импорт
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImport(f);
            e.target.value = "";
          }}
        />
        <Button
          variant="outline"
          onClick={() => {
            downloadEffortRowTemplate(
              employees.map((e) => fio(e)),
              store.projects.map((p) => p.name),
            );
            toast.success("Шаблон скачивается");
          }}
        >
          <Download className="size-4" /> Шаблон (построчный)
        </Button>
        <Button variant="outline" disabled={!editable} onClick={() => bulkRef.current?.click()}>
          <Upload className="size-4" /> Массовый импорт
        </Button>
        <input
          ref={bulkRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleBulkImport(f);
            e.target.value = "";
          }}
        />
      </div>


      {!editable && (
        <p className="mt-3 text-xs text-muted-foreground">
          Вы можете заполнять только свою страницу трудозатрат. Чужие данные доступны для просмотра.
        </p>
      )}

      <p className="mt-4 text-sm font-medium">
        Табель трудозатрат · {fio(person)} · {MONTHS[month]} {year}
      </p>

      <div className="mt-3 overflow-x-auto rounded-lg border bg-card">
        <table className="grid-table w-full" onMouseLeave={() => setHoverCell(null)}>
          <thead>
            <tr className="bg-muted">
              <th className="sticky left-0 z-10 min-w-[220px] border-r border-b bg-muted px-3 py-2 text-left text-xs font-medium">
                Проект
              </th>
              <th className="min-w-[110px] border-r border-b px-2 py-2 text-left text-xs font-medium">
                Стадия
              </th>
              <th className="min-w-[160px] border-r border-b px-2 py-2 text-left text-xs font-medium">
                Вид работ
              </th>
              {days.map((d) => (
                <th
                  key={d}
                  className="day-cell font-medium"
                  style={{
                    background: isWorkday(iso(year, month, d)) ? undefined : "var(--weekend)",
                    boxShadow: hoverCell?.col === d ? HOVER_TINT : undefined,
                  }}
                >
                  <div>{d}</div>
                  <div className="text-[9px] text-muted-foreground">
                    {WEEKDAYS_SHORT[weekdayIndex(year, month, d)]}
                  </div>
                </th>
              ))}
              <th className="min-w-[64px] border-b px-2 text-xs">Всего</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id}>
                <th className="sticky left-0 z-10 border-r border-b bg-card px-2 py-1 text-left text-xs font-normal">
                  <div className="flex items-center gap-1">
                    <select
                      className="w-full rounded border bg-background px-1 py-1 text-xs"
                      disabled={!editable}
                      value={r.projectId}
                      onChange={(e) => {
                        ensureRows();
                        setRow(r.id, (row) => {
                          row.projectId = e.target.value;
                          const st =
                            store.projects.find((p) => p.id === e.target.value)?.stages ?? [];
                          if (!row.stage || !st.includes(row.stage as never))
                            row.stage = st.length === 1 ? st[0]! : "";
                        });
                      }}
                    >
                      <option value="">— выберите проект —</option>
                      {store.projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    {rows.length > 1 && (
                      <button
                        className="text-muted-foreground hover:text-destructive"
                        title="Удалить строку"
                        onClick={() => patchRows((l) => l.filter((x) => x.id !== r.id))}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                </th>
                <td className="border-r border-b px-1 py-1">
                  {(() => {
                    const st = store.projects.find((p) => p.id === r.projectId)?.stages ?? [];
                    return (
                      <select
                        className="w-full rounded border bg-background px-1 py-1 text-xs disabled:opacity-50"
                        value={r.stage ?? ""}
                        disabled={!editable || !st.length}
                        onChange={(e) => {
                          ensureRows();
                          setRow(r.id, (row) => (row.stage = e.target.value));
                        }}
                      >
                        <option value="">{st.length ? "— стадия —" : "нет стадий"}</option>
                        {st.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    );
                  })()}
                </td>
                <td className="border-r border-b px-1 py-1">
                  <input
                    list="worktypes"
                    className="w-full rounded border bg-background px-1 py-1 text-xs"
                    disabled={!editable}
                    value={r.workType}
                    placeholder="необязательно"
                    onChange={(e) => {
                      ensureRows();
                      setRow(r.id, (row) => (row.workType = e.target.value));
                    }}
                  />
                </td>
                {days.map((d) => {
                  const weekend = !isWorkday(iso(year, month, d));
                  const v = r.hours[String(d)];
                  return (
                    <td
                      key={d}
                      className="day-cell p-0"
                      style={{ background: weekend ? "var(--weekend)" : undefined }}
                    >
                      <input
                        className="h-full w-full bg-transparent text-center text-xs outline-none"
                        readOnly={!editable}
                        value={v === undefined ? "" : String(v)}
                        inputMode="decimal"
                        onChange={(e) => {
                          const raw = e.target.value.replace(",", ".").trim();
                          ensureRows();
                          setRow(r.id, (row) => {
                            if (raw === "") delete row.hours[String(d)];
                            else {
                              const n = Number(raw);
                              if (!Number.isNaN(n)) row.hours[String(d)] = n;
                            }
                          });
                        }}
                      />
                    </td>
                  );
                })}
                <td className="border-b px-2 text-center text-xs font-medium">{rowTotal(r)}</td>
              </tr>
            ))}
            <tr className="bg-muted/60 font-medium">
              <th className="sticky left-0 z-10 border-r border-b bg-muted/60 px-3 py-1 text-left text-xs">
                Итого
              </th>
              <td className="border-r border-b" colSpan={2} />
              {days.map((d) => (
                <td key={d} className="day-cell text-xs">
                  {dayTotal(d) || ""}
                </td>
              ))}
              <td className="border-b px-2 text-center text-xs">{grandTotal}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <datalist id="worktypes">
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      <Button
        className="mt-3"
        variant="outline"
        disabled={!editable}
        onClick={() =>
          patchRows((l) => [
            ...(l.length ? l : [{ id: `r${Date.now()}`, projectId: "", workType: "", hours: {} }]),
            { id: `r${Date.now()}x`, projectId: "", workType: "", hours: {} },
          ])
        }
      >
        <Plus className="size-4" /> Добавить строку
      </Button>

      {/* Сводка заполненности по месяцам */}
      <div className="mt-8 flex items-center gap-2">
        <span className="text-sm font-medium">Заполненность по месяцам</span>
        <Button variant="outline" size="sm" onClick={() => setGridYear(gridYear - 1)}>
          ‹
        </Button>
        <span className="w-12 text-center text-sm font-medium">{gridYear}</span>
        <Button variant="outline" size="sm" onClick={() => setGridYear(gridYear + 1)}>
          ›
        </Button>
        <span className="text-xs text-muted-foreground">
          зелёная ячейка — «Трудозатраты заполнены»
        </span>
      </div>

      <div className="mt-2 inline-block max-w-full overflow-x-auto rounded-lg border bg-card">
        <table className="grid-table text-[11px]">
          <thead>
            <tr className="bg-muted">
              <th className="min-w-[180px] border-r border-b px-2 py-1 text-left font-medium">
                ФИО
              </th>
              {MONTHS_SHORT.map((m) => (
                <th key={m} className="w-8 border-r border-b px-1 py-1 font-medium">
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id}>
                <th className="border-r border-b px-2 py-0.5 text-left font-normal">
                  <PersonLink id={e.id} name={fio(e)} />
                </th>
                {MONTHS_SHORT.map((_, m) => {
                  const k = ymKey(gridYear, m);
                  const ok = isEffortDone(store, e.id, k);
                  return (
                    <td
                      key={m}
                      className="h-5 w-8 cursor-pointer border-r border-b"
                      style={{ background: ok ? "#c9f2cf" : undefined }}
                      title={ok ? "Заполнено" : "Не отмечено"}
                      onClick={() => {
                        setPersonId(e.id);
                        setYear(gridYear);
                        setMonth(m);
                      }}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
