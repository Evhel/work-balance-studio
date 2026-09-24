import * as XLSX from "xlsx-js-style";
import { MONTHS, daysInMonth, iso, isWeekendDate } from "./dates";

export type ExportRow = { fio: string; values: string[]; hours: number; days: number };
export type ExportLegendItem = { code: string; label: string };

const BORDER = {
  top: { style: "thin", color: { rgb: "9E9E9E" } },
  bottom: { style: "thin", color: { rgb: "9E9E9E" } },
  left: { style: "thin", color: { rgb: "9E9E9E" } },
  right: { style: "thin", color: { rgb: "9E9E9E" } },
} as const;

const FONT = { name: "Arial", sz: 10 };

function cell(
  value: string | number,
  opts: { bold?: boolean; fill?: string; center?: boolean; border?: boolean; sz?: number } = {},
) {
  const s: Record<string, unknown> = {
    font: { ...FONT, bold: !!opts.bold, sz: opts.sz ?? FONT.sz },
    alignment: { horizontal: opts.center ? "center" : "left", vertical: "center", wrapText: false },
  };
  if (opts.border !== false) s["border"] = BORDER;
  if (opts.fill) s["fill"] = { patternType: "solid", fgColor: { rgb: opts.fill } };
  return { v: value, t: typeof value === "number" ? "n" : "s", s };
}

function buildSheet(
  year: number,
  month: number,
  rows: ExportRow[],
  normDays: number,
  title: string,
  legend: ExportLegendItem[],
) {
  const dim = daysInMonth(year, month);
  const weekend = Array.from({ length: dim }, (_, i) => isWeekendDate(year, month, i + 1));
  const aoa: unknown[][] = [];

  aoa.push([cell(title, { bold: true, sz: 13, border: false })]);
  aoa.push([]);
  aoa.push([
    cell("ФИО", { bold: true, fill: "E7DCF5", center: true }),
    ...Array.from({ length: dim }, (_, i) =>
      cell(i + 1, { bold: true, center: true, fill: weekend[i] ? "D9D2E0" : "E7DCF5" }),
    ),
    cell("часы", { bold: true, center: true, fill: "E7DCF5" }),
    cell("р.дни", { bold: true, center: true, fill: "E7DCF5" }),
  ]);

  for (const r of rows) {
    aoa.push([
      cell(r.fio),
      ...Array.from({ length: dim }, (_, i) =>
        cell(r.values[i] ?? "", weekend[i] ? { center: true, fill: "F0EDF5" } : { center: true }),
      ),
      cell(r.hours, { center: true, bold: true }),
      cell(r.days, { center: true, bold: true }),
    ]);
  }

  aoa.push([]);
  aoa.push([cell("Условные обозначения:", { bold: true, border: false })]);
  for (const l of legend) {
    aoa.push([cell(l.code, { bold: true, border: false }), cell(l.label, { border: false })]);
  }
  aoa.push([]);
  aoa.push([cell(`Норма: ${normDays} р.д. / ${normDays * 8} ч`, { border: false })]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 30 }, ...Array.from({ length: dim + 2 }, () => ({ wch: 5 }))];
  ws["!rows"] = [{ hpt: 22 }];
  ws["!freeze"] = { xSplit: 1, ySplit: 3 };
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.min(dim, 12) } }];
  return ws;
}

export function buildMonthSheet(
  year: number,
  month: number,
  rows: ExportRow[],
  normDays: number,
  legend: ExportLegendItem[],
) {
  return buildSheet(
    year,
    month,
    rows,
    normDays,
    `Табель АРВ ${MONTHS[month]} ${year} (норма ${normDays} р.д./${normDays * 8} ч)`,
    legend,
  );
}

export function downloadMonth(
  year: number,
  month: number,
  rows: ExportRow[],
  normDays: number,
  legend: ExportLegendItem[],
) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    buildMonthSheet(year, month, rows, normDays, legend),
    `${MONTHS[month]}`,
  );
  XLSX.writeFile(wb, `АРВ_Табель_${year}_${MONTHS[month]}.xlsx`);
}

/** Пустой шаблон для пакетного импорта: те же ФИО, пустые дни */
export function downloadTemplate(
  year: number,
  month: number,
  names: string[],
  normDays: number,
  legend: ExportLegendItem[],
) {
  const dim = daysInMonth(year, month);
  const rows: ExportRow[] = names.map((n) => ({
    fio: n,
    values: Array.from({ length: dim }, () => ""),
    hours: 0,
    days: 0,
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    buildSheet(
      year,
      month,
      rows,
      normDays,
      `Табель АРВ ${MONTHS[month]} ${year} (шаблон для заполнения)`,
      legend,
    ),
    `${MONTHS[month]}`,
  );
  XLSX.writeFile(wb, `АРВ_Шаблон_${year}_${MONTHS[month]}.xlsx`);
}

export type ImportedCell = { fio: string; date: string; value: string };

/** Разбирает файл: ищет заголовок с месяцем/годом, строку с номерами дней и данные. */
export async function parseImport(file: File): Promise<ImportedCell[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const out: ImportedCell[] = [];

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, raw: false });

    const byRows = parseRowImport(aoa);
    if (byRows.length) {
      out.push(...byRows);
      continue;
    }

    let year = 0;
    let month = -1;
    for (const row of aoa) {
      const text = String(row?.[0] ?? "");
      const m = MONTHS.findIndex((mm) => text.toLowerCase().includes(mm.toLowerCase()));
      const y = text.match(/(20\d{2})/);
      if (m >= 0 && y) {
        month = m;
        year = Number(y[1]);
        break;
      }
    }
    if (month < 0) {
      const m = MONTHS.findIndex((mm) => name.toLowerCase().includes(mm.toLowerCase()));
      const y = name.match(/(20\d{2})/);
      if (m >= 0 && y) {
        month = m;
        year = Number(y[1]);
      }
    }
    if (month < 0 || !year) continue;

    const headerIdx = aoa.findIndex(
      (row) => String(row?.[0] ?? "").trim().toUpperCase() === "ФИО",
    );
    if (headerIdx < 0) continue;
    const header = aoa[headerIdx]!;
    const dayCols: { col: number; day: number }[] = [];
    header.forEach((c, idx) => {
      const n = Number(c);
      if (idx > 0 && Number.isInteger(n) && n >= 1 && n <= 31) dayCols.push({ col: idx, day: n });
    });

    for (let r = headerIdx + 1; r < aoa.length; r++) {
      const row = aoa[r]!;
      const f = String(row?.[0] ?? "").trim();
      if (!f || f.startsWith("Условные")) break;
      for (const dc of dayCols) {
        const v = row[dc.col];
        if (v === undefined || v === null || String(v).trim() === "") continue;
        out.push({ fio: f, date: iso(year, month, dc.day), value: String(v).trim() });
      }
    }
  }
  return out;
}

/* ─────────── Технический (построчный) шаблон для импорта табеля ─────────── */

const ROW_HEADER = ["ФИО", "Дата", "Значение"];

/**
 * Построчный шаблон: одна строка = один человек + одна дата + значение.
 * Удобно для массовой загрузки данных сразу на многих сотрудников.
 */
export function downloadRowTemplate(year: number, month: number, names: string[], codes: string[]) {
  const dim = daysInMonth(year, month);
  const aoa: unknown[][] = [
    [
      cell("Построчный импорт табеля АРВ", { bold: true, sz: 13, border: false }),
      cell(`${MONTHS[month]} ${year}`, { border: false }),
    ],
    [
      cell(
        `Значение: число часов (например 8) или код: ${codes.join(", ")}. Пустая ячейка "Значение" — пропуск.`,
        { border: false },
      ),
    ],
    [],
    ROW_HEADER.map((h) => cell(h, { bold: true, fill: "E7DCF5", center: true })),
  ];
  for (const n of names) {
    for (let d = 1; d <= dim; d++) {
      aoa.push([cell(n), cell(iso(year, month, d), { center: true }), cell("", { center: true })]);
    }
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 34 }, { wch: 14 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Импорт");
  XLSX.writeFile(wb, `АРВ_Шаблон_построчный_${year}_${MONTHS[month]}.xlsx`);
}

function normDate(v: string) {
  const t = v.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
  return "";
}

/** Разбор построчного файла (ФИО / Дата / Значение) */
export function parseRowImport(aoa: (string | number)[][]): ImportedCell[] {
  const headerIdx = aoa.findIndex(
    (row) =>
      String(row?.[0] ?? "").trim().toUpperCase() === "ФИО" &&
      String(row?.[1] ?? "").trim().toLowerCase().startsWith("дат"),
  );
  if (headerIdx < 0) return [];
  const out: ImportedCell[] = [];
  for (let r = headerIdx + 1; r < aoa.length; r++) {
    const row = aoa[r] ?? [];
    const f = String(row[0] ?? "").trim();
    const date = normDate(String(row[1] ?? ""));
    const value = String(row[2] ?? "").trim();
    if (!f || !date || !value) continue;
    out.push({ fio: f, date, value });
  }
  return out;
}

/* ─────────── Табель трудозатрат ─────────── */

export type EffortExportRow = { project: string; workType: string; values: (number | "")[] };

export function downloadEffort(
  year: number,
  month: number,
  who: string,
  rows: EffortExportRow[],
) {
  const dim = daysInMonth(year, month);
  const weekend = Array.from({ length: dim }, (_, i) => isWeekendDate(year, month, i + 1));
  const aoa: unknown[][] = [];
  aoa.push([cell(`Трудозатраты · ${who} · ${MONTHS[month]} ${year}`, { bold: true, sz: 13, border: false })]);
  aoa.push([]);
  aoa.push([
    cell("Проект", { bold: true, fill: "E7DCF5", center: true }),
    cell("Вид работ", { bold: true, fill: "E7DCF5", center: true }),
    ...Array.from({ length: dim }, (_, i) =>
      cell(i + 1, { bold: true, center: true, fill: weekend[i] ? "D9D2E0" : "E7DCF5" }),
    ),
    cell("Всего", { bold: true, center: true, fill: "E7DCF5" }),
  ]);
  for (const r of rows) {
    const total = r.values.reduce<number>((a, b) => a + (typeof b === "number" ? b : 0), 0);
    aoa.push([
      cell(r.project),
      cell(r.workType),
      ...r.values.map((v, i) =>
        cell(v === "" ? "" : v, weekend[i] ? { center: true, fill: "F0EDF5" } : { center: true }),
      ),
      cell(total, { center: true, bold: true }),
    ]);
  }
  const totals = Array.from({ length: dim }, (_, i) =>
    rows.reduce<number>((a, r) => a + (typeof r.values[i] === "number" ? (r.values[i] as number) : 0), 0),
  );
  aoa.push([
    cell("Итого", { bold: true }),
    cell(""),
    ...totals.map((t) => cell(t, { center: true, bold: true })),
    cell(totals.reduce((a, b) => a + b, 0), { center: true, bold: true }),
  ]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 28 }, { wch: 22 }, ...Array.from({ length: dim + 1 }, () => ({ wch: 5 }))];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `${MONTHS[month]}`);
  XLSX.writeFile(wb, `АРВ_Трудозатраты_${who}_${year}_${MONTHS[month]}.xlsx`);
}

export type ImportedEffortRow = { project: string; workType: string; hours: Record<string, number> };

export async function parseEffortImport(file: File): Promise<ImportedEffortRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const out: ImportedEffortRow[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, raw: false });
    const headerIdx = aoa.findIndex(
      (row) => String(row?.[0] ?? "").trim().toLowerCase() === "проект",
    );
    if (headerIdx < 0) continue;
    const header = aoa[headerIdx]!;
    const dayCols: { col: number; day: number }[] = [];
    header.forEach((c, idx) => {
      const n = Number(c);
      if (idx > 1 && Number.isInteger(n) && n >= 1 && n <= 31) dayCols.push({ col: idx, day: n });
    });
    for (let r = headerIdx + 1; r < aoa.length; r++) {
      const row = aoa[r] ?? [];
      const project = String(row[0] ?? "").trim();
      if (!project || project.toLowerCase() === "итого") continue;
      const hours: Record<string, number> = {};
      for (const dc of dayCols) {
        const n = Number(String(row[dc.col] ?? "").replace(",", "."));
        if (!Number.isNaN(n) && n !== 0 && String(row[dc.col] ?? "").trim() !== "")
          hours[String(dc.day)] = n;
      }
      out.push({ project, workType: String(row[1] ?? "").trim(), hours });
    }
  }
  return out;
}

/* ─────────── Построчный (массовый) импорт трудозатрат ─────────── */

const EFFORT_ROW_HEADER = ["ФИО", "Дата", "Проект", "Вид работ", "Часы"];

export type EffortRowRecord = {
  fio: string;
  date: string; // YYYY-MM-DD
  project: string;
  workType: string;
  hours: number;
};

/** Шаблон: одна строка = сотрудник + дата + проект + вид работ + часы (за любое число месяцев) */
export function downloadEffortRowTemplate(names: string[], projects: string[]) {
  const today = new Date();
  const aoa: unknown[][] = [
    [
      cell("Построчный импорт трудозатрат АРВ", { bold: true, sz: 13, border: false }),
    ],
    [
      cell(
        "Одна строка — один сотрудник, одна дата, один проект и вид работ. Можно загружать сразу много месяцев.",
        { border: false },
      ),
    ],
    [
      cell("Формат даты: ГГГГ-ММ-ДД или ДД.ММ.ГГГГ. Часы — число (например 8 или 4,5).", {
        border: false,
      }),
    ],
    [],
    EFFORT_ROW_HEADER.map((h) => cell(h, { bold: true, fill: "E7DCF5", center: true })),
  ];
  const sample = names.slice(0, 3);
  for (const n of sample) {
    for (let d = 1; d <= 3; d++) {
      aoa.push([
        cell(n),
        cell(iso(today.getFullYear(), today.getMonth(), d), { center: true }),
        cell(projects[0] ?? ""),
        cell(""),
        cell("", { center: true }),
      ]);
    }
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 30 }, { wch: 14 }, { wch: 30 }, { wch: 26 }, { wch: 8 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Трудозатраты");
  const ref = XLSX.utils.aoa_to_sheet([
    [cell("Проекты (копируйте названия в столбец «Проект»)", { bold: true, border: false })],
    ...projects.map((p) => [cell(p)]),
    [],
    [cell("Сотрудники", { bold: true, border: false })],
    ...names.map((n) => [cell(n)]),
  ]);
  ref["!cols"] = [{ wch: 40 }];
  XLSX.utils.book_append_sheet(wb, ref, "Справочники");
  XLSX.writeFile(wb, "АРВ_Шаблон_трудозатраты_построчный.xlsx");
}

/** Разбор построчного файла трудозатрат */
export async function parseEffortRowImport(file: File): Promise<EffortRowRecord[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const out: EffortRowRecord[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, raw: false });
    const headerIdx = aoa.findIndex(
      (row) =>
        String(row?.[0] ?? "").trim().toUpperCase() === "ФИО" &&
        String(row?.[1] ?? "").trim().toLowerCase().startsWith("дат") &&
        String(row?.[2] ?? "").trim().toLowerCase().startsWith("проект"),
    );
    if (headerIdx < 0) continue;
    for (let r = headerIdx + 1; r < aoa.length; r++) {
      const row = aoa[r] ?? [];
      const f = String(row[0] ?? "").trim();
      const date = normDate(String(row[1] ?? ""));
      const project = String(row[2] ?? "").trim();
      const hours = Number(String(row[4] ?? "").replace(",", "."));
      if (!f || !date || !project || !hours || Number.isNaN(hours)) continue;
      out.push({ fio: f, date, project, workType: String(row[3] ?? "").trim(), hours });
    }
  }
  return out;
}


/* ─────────── Универсальный экспорт таблиц (дашборды) ─────────── */

export function downloadTables(
  fileName: string,
  sheets: { name: string; rows: (string | number)[][] }[],
) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const aoa = s.rows.map((row, ri) =>
      row.map((v) =>
        cell(v, {
          bold: ri === 0,
          center: ri === 0 || typeof v === "number",
          ...(ri === 0 ? { fill: "E7DCF5" } : {}),
        }),
      ),
    );
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = (s.rows[0] ?? []).map((_, i) => ({ wch: i === 0 ? 32 : 12 }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 30));
  }
  XLSX.writeFile(wb, fileName);
}
