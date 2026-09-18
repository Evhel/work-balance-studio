import { Link, createFileRoute } from "@tanstack/react-router";
import { CHART_COLORS } from "@/lib/colors";
import { useMemo, useRef, useState } from "react";
import { Calendar as CalendarIcon, Check, Download, RotateCcw, Save, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend as RLegend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fio, useStore } from "@/lib/store";
import { MONTHS_SHORT, pad } from "@/lib/dates";
import { allFacts, parseYm, ymValue } from "@/lib/effort";
import { downloadTables } from "@/lib/excel";
import { PROJECT_STAGES, type FilterSet } from "@/lib/types";

export const Route = createFileRoute("/dashboards")({
  head: () => ({
    meta: [
      { title: "Дашборды — ARV. Трудозатораты" },
      {
        name: "description",
        content: "Сводные таблицы и графики фактических трудозатрат по проектам и разделам.",
      },
      { property: "og:title", content: "Дашборды — ARV. Трудозатораты" },
      {
        property: "og:description",
        content: "Сводные таблицы и графики фактических трудозатрат бюро.",
      },
    ],
  }),
  component: DashboardsPage,
});

function MultiSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: string; name: string }[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="justify-start">
          {label}: {value.length === 0 ? "все" : `${value.length}`}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="max-h-80 w-72 overflow-y-auto">
        <div className="mb-2 flex justify-between text-xs">
          <button className="text-primary" onClick={() => onChange(options.map((o) => o.id))}>
            выбрать все
          </button>
          <button className="text-primary" onClick={() => onChange([])}>
            сбросить
          </button>
        </div>
        {options.map((o) => (
          <label key={o.id} className="flex items-center gap-2 py-1 text-sm">
            <Checkbox
              checked={value.includes(o.id)}
              onCheckedChange={(c) =>
                onChange(c ? [...value, o.id] : value.filter((x) => x !== o.id))
              }
            />
            <span className="truncate">{o.name}</span>
          </label>
        ))}
        {options.length === 0 && <p className="text-xs text-muted-foreground">Нет значений</p>}
      </PopoverContent>
    </Popover>
  );
}

function MonthField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const { year, month } = parseYm(value);
  const years = Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - 5 + i);
  const shift = (delta: number) => {
    const t = year * 12 + month + delta;
    onChange(`${Math.floor(t / 12)}-${pad((t % 12) + 1)}`);
  };
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Button variant="outline" size="sm" onClick={() => shift(-1)}>
        ‹
      </Button>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-[150px] justify-start gap-2 pl-2">
            <CalendarIcon className="size-4 shrink-0" />
            {MONTHS_SHORT[month]} {year}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64">
          <div className="mb-2 flex items-center justify-between">
            <button className="px-2 text-sm" onClick={() => onChange(`${year - 1}-${pad(month + 1)}`)}>
              ‹
            </button>
            <select
              className="rounded-md border bg-background px-2 py-1 text-sm"
              value={year}
              onChange={(e) => onChange(`${Number(e.target.value)}-${pad(month + 1)}`)}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button className="px-2 text-sm" onClick={() => onChange(`${year + 1}-${pad(month + 1)}`)}>
              ›
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {MONTHS_SHORT.map((m, i) => (
              <button
                key={m}
                className={`rounded-md border px-2 py-1 text-xs ${
                  i === month ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                }`}
                onClick={() => onChange(`${year}-${pad(i + 1)}`)}
              >
                {m}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <Button variant="outline" size="sm" onClick={() => shift(1)}>
        ›
      </Button>
    </div>
  );
}

const num = (n: number) => Math.round(n * 10) / 10;

function DashboardsPage() {
  const { store, update, currentUser } = useStore();
  /** Наборы фильтров у каждого пользователя свои */
  const mySets = store.filterSets.filter((s) => (s.ownerId ?? currentUser?.id) === currentUser?.id);
  const facts = useMemo(() => allFacts(store), [store]);
  const now = new Date();
  const thisYm = `${now.getFullYear()}-${pad(1)}`;

  const [unit, setUnit] = useState<"hours" | "days">("days");
  const [depts, setDepts] = useState<string[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [people, setPeople] = useState<string[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [splitStages, setSplitStages] = useState(false);
  const [from, setFrom] = useState(thisYm);
  const [to, setTo] = useState(`${now.getFullYear()}-${pad(12)}`);
  const [setName, setSetName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeSetId, setActiveSetId] = useState<string | null>(null);

  const resetFilters = () => {
    setUnit("days");
    setDepts([]);
    setProjects([]);
    setPeople([]);
    setStages([]);
    setSplitStages(false);
    setFrom(thisYm);
    setTo(`${now.getFullYear()}-${pad(12)}`);
    setSetName("");
    setEditingId(null);
    setActiveSetId(null);
  };


  const deptOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...store.employees.filter((e) => e.trackEffort !== false).map((e) => e.department),
          ...store.contractors.map((c) => c.department),
        ]),
      )
        .filter(Boolean)
        .sort()
        .map((d) => ({ id: d, name: d })),
    [store.employees, store.contractors],
  );
  const projectOptions = store.projects.map((p) => ({ id: p.id, name: p.name }));
  const stageOptions = PROJECT_STAGES.map((s) => ({ id: s, name: s }));
  const peopleOptions = [...store.employees.filter((e) => e.trackEffort !== false)]
    .map((e) => ({ id: e.id, name: fio(e) }))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));

  const conv = (h: number) => (unit === "hours" ? h : Math.round(h / 8));
  const unitLabel = unit === "hours" ? "ч" : "дн";

  const filtered = facts
    .filter((f) => {
      if (depts.length && !depts.includes(f.department)) return false;
      if (projects.length && !projects.includes(f.projectId)) return false;
      if (people.length && !people.includes(f.personId)) return false;
      if (stages.length && !stages.includes(f.stage)) return false;
      const v = ymValue(f.ym);
      if (v < ymValue(from) || v > ymValue(to)) return false;
      return true;
    })
    .map((f) =>
      splitStages && f.stage ? { ...f, projectId: `${f.projectId}__${f.stage}` } : f,
    );

  const baseId = (id: string) => id.split("__")[0]!;
  const projName = (id: string) => {
    const name = store.projects.find((p) => p.id === baseId(id))?.name ?? "—";
    const st = id.includes("__") ? id.split("__")[1] : "";
    return st ? `${name} · ${st}` : name;
  };
  const projColor = (id: string) =>
    store.projects.find((p) => p.id === baseId(id))?.color ?? "#999";

  const usedProjects = Array.from(new Set(filtered.map((f) => f.projectId)));
  const usedDepts = Array.from(new Set(filtered.map((f) => f.department))).sort();
  const usedYms = Array.from(new Set(filtered.map((f) => f.ym))).sort();

  const sum = (pred: (f: (typeof filtered)[number]) => boolean) =>
    conv(filtered.filter(pred).reduce((a, f) => a + f.hours, 0));

  /* Таблица 3: проект × раздел */
  const table3 = usedProjects.map((pid) => ({
    project: projName(pid),
    pid,
    cells: usedDepts.map((d) => num(sum((f) => f.projectId === pid && f.department === d))),
    total: num(sum((f) => f.projectId === pid)),
  }));
  const table3Totals = usedDepts.map((d) => num(sum((f) => f.department === d)));
  const grand = num(sum(() => true));

  /* Таблица 5: проект × месяцы/годы */
  const years = Array.from(new Set(usedYms.map((y) => parseYm(y).year))).sort();
  const columns: { key: string; label: string; year: number; isTotal: boolean }[] = [];
  for (const y of years) {
    const months = usedYms.filter((k) => parseYm(k).year === y).sort();
    for (const k of months)
      columns.push({ key: k, label: String(parseYm(k).month + 1), year: y, isTotal: false });
    columns.push({ key: `t${y}`, label: `${y} Итого`, year: y, isTotal: true });
  }
  const cellFor = (pid: string, col: (typeof columns)[number]) =>
    col.isTotal
      ? num(sum((f) => f.projectId === pid && parseYm(f.ym).year === col.year))
      : num(sum((f) => f.projectId === pid && f.ym === col.key));
  const table5 = usedProjects.map((pid) => ({
    pid,
    project: projName(pid),
    cells: columns.map((c) => cellFor(pid, c)),
    total: num(sum((f) => f.projectId === pid)),
  }));
  const table5Totals = columns.map((c) =>
    c.isTotal
      ? num(sum((f) => parseYm(f.ym).year === c.year))
      : num(sum((f) => f.ym === c.key)),
  );

  /* Данные графиков */
  const donut = usedProjects.map((pid) => ({
    name: projName(pid),
    value: num(sum((f) => f.projectId === pid)),
    color: projColor(pid),
  }));

  const lineData = usedYms.map((k) => {
    const row: Record<string, string | number> = {
      label: `${MONTHS_SHORT[parseYm(k).month]} ${parseYm(k).year}`,
    };
    for (const pid of usedProjects) row[projName(pid)] = num(sum((f) => f.projectId === pid && f.ym === k));
    return row;
  });

  const barData = usedProjects.map((pid) => {
    const row: Record<string, string | number> = { project: projName(pid) };
    for (const d of usedDepts) row[d] = num(sum((f) => f.projectId === pid && f.department === d));
    return row;
  });

  const byPerson = Array.from(new Set(filtered.map((f) => f.personId)))
    .map((id) => ({
      name: store.employees.find((e) => e.id === id)
        ? fio(store.employees.find((e) => e.id === id)!)
        : (store.contractors.find((c) => c.id === id) ? fio(store.contractors.find((c) => c.id === id)!) : id),
      value: num(sum((f) => f.personId === id)),
    }))
    .sort((a, b) => b.value - a.value);

  const byWorkType = Array.from(new Set(filtered.map((f) => f.workType)))
    .map((w) => ({ name: w, value: num(sum((f) => f.workType === w)) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);

  const DEPT_COLORS = CHART_COLORS;

  /* Наборы фильтров */
  const applySet = (s: FilterSet) => {
    setUnit(s.unit);
    setDepts(s.depts);
    setProjects(s.projects);
    setPeople(s.people);
    setStages(s.stages ?? []);
    setFrom(s.from);
    setTo(s.to);
    setEditingId(s.id);
    setActiveSetId(s.id);
    setSetName(s.name);
  };

  /** Краткое имя набора по выбранным фильтрам */
  const autoName = () => {
    const short = (ym: string) => {
      const { year, month } = parseYm(ym);
      return `${MONTHS_SHORT[month]}${String(year).slice(2)}`;
    };
    const parts: string[] = [];
    parts.push(depts.length ? `Разделы: ${depts.join(", ")}` : "Все разделы");
    parts.push(
      projects.length ? `Проекты: ${projects.map((p) => projName(p)).join(", ")}` : "Все проекты",
    );
    parts.push(
      people.length
        ? `Сотрудники: ${people
            .map((id) => peopleOptions.find((p) => p.id === id)?.name ?? id)
            .join(", ")}`
        : "Все сотрудники",
    );
    parts.push(stages.length ? `Стадии: ${stages.join(", ")}` : "Все стадии");
    parts.push(from === to ? short(from) : `${short(from)}–${short(to)}`);
    parts.push(unit === "hours" ? "ч" : "дн");
    return parts.join(" · ").slice(0, 160);

  };

  const saveSet = () => {
    const name = setName.trim() || autoName();
    setSetName(name);
    update((d) => {
      const payload: FilterSet = {
        id: editingId ?? `fs${Date.now()}`,
        ownerId: currentUser?.id,
        name,
        unit,
        depts,
        projects,
        people,
        stages,
        from,
        to,
      };
      const idx = d.filterSets.findIndex((x) => x.id === payload.id);
      if (idx >= 0) d.filterSets[idx] = payload;
      else d.filterSets.push(payload);
    });
    setEditingId(null);
    toast.success("Набор фильтров сохранён");
  };

  const exportAll = () => {
    downloadTables("АРВ_Дашборды.xlsx", [
      {
        name: "Проект × Раздел",
        rows: [
          ["Проект", ...usedDepts, "Общий итог"],
          ...table3.map((r) => [r.project, ...r.cells, r.total]),
          ["Общий итог", ...table3Totals, grand],
        ],
      },
      {
        name: "Проект × Месяцы",
        rows: [
          ["Проект", ...columns.map((c) => c.label), "Общий итог"],
          ...table5.map((r) => [r.project, ...r.cells, r.total]),
          ["Общий итог", ...table5Totals, grand],
        ],
      },
      {
        name: "По сотрудникам",
        rows: [["Сотрудник", `Трудозатраты, ${unitLabel}`], ...byPerson.map((r) => [r.name, r.value])],
      },
      {
        name: "По видам работ",
        rows: [["Вид работ", `Трудозатраты, ${unitLabel}`], ...byWorkType.map((r) => [r.name, r.value])],
      },
    ]);
    toast.success("Файл скачивается");
  };

  /** Текст кириллицей растеризуем — встроенные шрифты jsPDF её не поддерживают */
  const drawText = (
    pdf: import("jspdf").jsPDF,
    text: string,
    x: number,
    y: number,
    size: number,
    color: string,
    align: "left" | "center" | "right",
  ) => {
    const scale = 4;
    const c = document.createElement("canvas");
    const cx = c.getContext("2d")!;
    const font = `600 ${size * scale}px "Helvetica Neue", Arial, sans-serif`;
    cx.font = font;
    const wpt = cx.measureText(text).width / scale;
    const hpt = size * 1.35;
    c.width = Math.ceil(wpt * scale);
    c.height = Math.ceil(hpt * scale);
    cx.font = font;
    cx.fillStyle = color;
    cx.textBaseline = "middle";
    cx.fillText(text, 0, c.height / 2);
    const left = align === "left" ? x : align === "center" ? x - wpt / 2 : x - wpt;
    pdf.addImage(c.toDataURL("image/png"), "PNG", left, y, wpt, hpt);
  };

  const pageRef = useRef<HTMLDivElement>(null);
  const secTop = useRef<HTMLDivElement>(null);
  const secBar = useRef<HTMLDivElement>(null);
  const secTable5 = useRef<HTMLDivElement>(null);

  const [pdfBusy, setPdfBusy] = useState(false);

  const exportPdf = async () => {
    setPdfBusy(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas-pro"),
        import("jspdf"),
      ]);
      const shoot = async (el: HTMLElement | null) =>
        el ? await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true }) : null;

      const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const margin = 28;
      const headH = 26;
      const footH = 18;
      const w = pw - margin * 2;

      const short = (ym: string) => {
        const { year, month } = parseYm(ym);
        return `${MONTHS_SHORT[month]} ${year}`;
      };

      const pages: HTMLElement[][] = [
        [secTop.current!].filter(Boolean),
        [secBar.current!, secTable5.current!].filter(Boolean),
        
      ];

      for (let i = 0; i < pages.length; i++) {
        if (i > 0) pdf.addPage();
        drawText(pdf, "АРВ · Дашборды трудозатрат", margin, margin, 13, "#520099", "left");
        drawText(
          pdf,
          new Date().toLocaleDateString("ru-RU"),
          pw - margin,
          margin + 2,
          10,
          "#6b7280",
          "right",
        );

        let y = margin + headH;
        if (i === 0) {
          drawText(
            pdf,
            `Период: ${short(from)} — ${short(to)} · Единицы: ${unit === "hours" ? "часы" : "дни"}`,
            margin,
            y,
            10,
            "#374151",
            "left",
          );
          y += 18;
        }

        const avail = ph - margin - footH - y;
        const shots = (await Promise.all(pages[i]!.map(shoot))).filter(Boolean) as HTMLCanvasElement[];
        const gap = 10;
        // масштаб, при котором все блоки страницы влезают по высоте и ширине
        const totalNatH = shots.reduce((a, c) => a + (c.height * w) / c.width, 0) + gap * (shots.length - 1);
        const k = Math.min(1, (avail) / totalNatH);
        for (const c of shots) {
          const iw = w * k;
          const ih = (c.height * iw) / c.width;
          pdf.addImage(c.toDataURL("image/jpeg", 0.92), "JPEG", margin, y, iw, ih);
          y += ih + gap;
        }
        drawText(pdf, `${i + 1} / ${pages.length}`, pw / 2, ph - margin, 9, "#6b7280", "center");
      }
      pdf.save("АРВ_Дашборды.pdf");
      toast.success("PDF готов");
    } catch {
      toast.error("Не удалось сформировать PDF");
    } finally {
      setPdfBusy(false);
    }
  };


  return (
    <div ref={pageRef} className="bg-background">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Дашборды</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportAll}>
            <Download className="size-4" /> Экспорт страницы в Excel
          </Button>
          <Button onClick={exportPdf} disabled={pdfBusy}>
            <Download className="size-4" /> {pdfBusy ? "Формирую PDF…" : "Экспорт в PDF"}
          </Button>
        </div>
      </div>


      {/* Фильтры */}
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
        <div className="flex overflow-hidden rounded-md border">
          {(["hours", "days"] as const).map((u) => (
            <button
              key={u}
              className={`px-3 py-1.5 text-sm ${unit === u ? "bg-primary text-primary-foreground" : "bg-background"}`}
              onClick={() => setUnit(u)}
            >
              {u === "hours" ? "Часы" : "Дни"}
            </button>
          ))}
        </div>
        <MultiSelect label="Раздел" options={deptOptions} value={depts} onChange={setDepts} />
        <MultiSelect label="Проект" options={projectOptions} value={projects} onChange={setProjects} />
        <MultiSelect label="Сотрудник" options={peopleOptions} value={people} onChange={setPeople} />
        <MultiSelect label="Стадия" options={stageOptions} value={stages} onChange={setStages} />
        <MonthField label="с" value={from} onChange={setFrom} />
        <MonthField label="по" value={to} onChange={setTo} />
        <button
          className={`rounded-md border px-3 py-1.5 text-sm ${
            splitStages ? "bg-primary text-primary-foreground" : "bg-background"
          }`}
          onClick={() => setSplitStages((v) => !v)}
          title="Каждая стадия проекта — отдельная строка"
        >
          Разделить по стадиям
        </button>
        <Button variant="ghost" onClick={resetFilters} className="text-muted-foreground">
          <RotateCcw className="size-4" /> Сбросить фильтры
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
        <Input
          className="w-[220px]"
          placeholder="Название набора (создастся автоматически)"
          value={setName}
          onChange={(e) => setSetName(e.target.value)}
        />
        <Button variant="outline" onClick={saveSet}>
          <Save className="size-4" /> {editingId ? "Обновить набор" : "Закрепить набор"}
        </Button>
        {mySets.map((s) => {
          const active = activeSetId === s.id;
          return (
            <span
              key={s.id}
              className={`flex items-center gap-1 rounded-md border px-2 py-1 text-sm ${
                active ? "border-primary bg-primary/10 ring-1 ring-primary" : ""
              }`}
            >
              {active && <Check className="size-3.5 text-primary" />}
              <button
                className={`font-medium ${active ? "text-primary" : "text-foreground"}`}
                onClick={() => applySet(s)}
              >
                {s.name}
              </button>
              <button
                className="text-muted-foreground hover:text-foreground"
                title="Изменить (загрузить и сохранить поверх)"
                onClick={() => applySet(s)}
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                className="text-muted-foreground hover:text-destructive"
                title="Удалить набор"
                onClick={() => {
                  update((d) => (d.filterSets = d.filterSets.filter((x) => x.id !== s.id)));
                  if (editingId === s.id) setEditingId(null);
                  if (activeSetId === s.id) setActiveSetId(null);
                }}
              >
                <Trash2 className="size-3.5" />
              </button>
            </span>
          );
        })}
        {activeSetId && (
          <span className="text-xs text-muted-foreground">
            Активный набор: «{mySets.find((s) => s.id === activeSetId)?.name}»
          </span>
        )}
      </div>


      {filtered.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          За выбранный период нет данных о трудозатратах. Заполните их на вкладке «Трудозатраты».
        </p>
      )}

      {/* Таблица 3 + пончик в одну строку */}
      <div
        ref={secTop}
        className="mt-6 grid gap-3 bg-background lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]"
      >

        <div className="min-w-0">
          <h2 className="text-base font-medium">
            Фактические трудозатраты: проект × раздел ({unitLabel})
          </h2>
          <div className="mt-2 overflow-x-auto rounded-lg border bg-card">
            <table className="grid-table w-full text-xs">
              <thead>
                <tr className="bg-muted">
                  <th className="min-w-[170px] border-r border-b px-2 py-1.5 text-left text-xs font-medium">
                    Проект
                  </th>
                  {usedDepts.map((d) => (
                    <th key={d} className="border-r border-b px-2 py-1.5 text-xs font-medium">
                      {d}
                    </th>
                  ))}
                  <th className="border-b px-2 py-1.5 text-xs font-medium">Итог</th>
                </tr>
              </thead>
              <tbody>
                {table3.map((r) => (
                  <tr key={r.pid}>
                    <th className="border-r border-b px-2 py-0.5 text-left text-xs font-normal">
                      <Link
                        to="/projects/$projectId"
                        params={{ projectId: r.pid }}
                        className="text-primary hover:underline"
                      >
                        {r.project}
                      </Link>
                    </th>
                    {r.cells.map((c, i) => (
                      <td key={i} className="border-r border-b px-2 py-0.5 text-center">
                        {c || ""}
                      </td>
                    ))}
                    <td className="border-b px-2 py-0.5 text-center font-medium">{r.total}</td>
                  </tr>
                ))}
                <tr className="bg-muted/60 font-medium">
                  <th className="border-r border-b px-2 py-0.5 text-left text-xs">Общий итог</th>
                  {table3Totals.map((c, i) => (
                    <td key={i} className="border-r border-b px-2 py-0.5 text-center">
                      {c || ""}
                    </td>
                  ))}
                  <td className="border-b px-2 py-0.5 text-center">{grand}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex min-w-0 flex-col">
          <h2 className="text-base font-medium">Трудозатраты по проектам</h2>
          <div className="mt-2 flex min-h-56 flex-1 gap-3 rounded-lg border bg-card p-3">
            <div className="relative min-h-48 min-w-0 flex-1">
              <div className="absolute inset-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donut}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="45%"
                      outerRadius="80%"
                    >
                      {donut.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => `${v} ${unitLabel}`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="w-40 shrink-0 overflow-y-auto text-[11px]">
              {donut.map((d) => (
                <div key={d.name} className="mb-0.5 flex items-center gap-1.5">
                  <span
                    className="size-2.5 shrink-0 rounded-sm"
                    style={{ background: d.color }}
                  />
                  <span className="truncate">{d.name}</span>
                  <b className="ml-auto">{d.value}</b>
                </div>
              ))}
            </div>
          </div>
        </div>


      </div>

      {/* Гистограмма с группировкой к таблице 3 */}
      <div ref={secBar} className="bg-background">
        <h2 className="mt-6 text-lg font-medium">Проекты по разделам (гистограмма с группировкой)</h2>
        <div className="mt-2 h-80 rounded-lg border bg-card p-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="project" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip formatter={(v: number) => `${v} ${unitLabel}`} />
              <RLegend />
              {usedDepts.map((d, i) => (
                <Bar key={d} dataKey={d} fill={DEPT_COLORS[i % DEPT_COLORS.length]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>


      {/* Таблица 5 */}
      <div ref={secTable5} className="bg-background">
      <h2 className="mt-6 text-lg font-medium">Трудозатраты по месяцам ({unitLabel})</h2>
      <div className="mt-2 overflow-x-auto rounded-lg border bg-card">

        <table className="grid-table w-full text-sm">
          <thead>
            <tr className="bg-muted">
              <th rowSpan={2} className="min-w-[220px] border-r border-b px-3 py-2 text-left text-xs font-medium">
                Проект
              </th>
              {years.map((y) => (
                <th
                  key={y}
                  colSpan={columns.filter((c) => c.year === y).length}
                  className="border-r border-b px-2 py-1 text-center text-xs font-medium"
                >
                  {y}
                </th>
              ))}
              <th rowSpan={2} className="border-b px-3 py-2 text-xs font-medium">Общий итог</th>
            </tr>
            <tr className="bg-muted">
              {columns.map((c) => (
                <th key={c.key} className="border-r border-b px-2 py-1 text-xs font-medium">
                  {c.isTotal ? "Итого" : c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table5.map((r) => (
              <tr key={r.pid}>
                <th className="border-r border-b px-3 py-1 text-left text-xs font-normal">
                  <Link
                    to="/projects/$projectId"
                    params={{ projectId: r.pid }}
                    className="text-primary hover:underline"
                  >
                    {r.project}
                  </Link>
                </th>
                {r.cells.map((c, i) => (
                  <td
                    key={i}
                    className="border-r border-b px-2 py-1 text-center text-xs"
                    style={{ background: columns[i]!.isTotal ? "var(--muted)" : undefined }}
                  >
                    {c || ""}
                  </td>
                ))}
                <td className="border-b px-2 py-1 text-center text-xs font-medium">{r.total}</td>
              </tr>
            ))}
            <tr className="bg-muted/60 font-medium">
              <th className="border-r border-b px-3 py-1 text-left text-xs">Общий итог</th>
              {table5Totals.map((c, i) => (
                <td key={i} className="border-r border-b px-2 py-1 text-center text-xs">{c || ""}</td>
              ))}
              <td className="border-b px-2 py-1 text-center text-xs">{grand}</td>
            </tr>
          </tbody>
        </table>
      </div>
      </div>

    </div>

  );

}
