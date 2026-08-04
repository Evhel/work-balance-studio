import * as XLSX from "xlsx-js-style";
import { MONTHS, daysInMonth, iso, isWeekendDate } from "./dates";
import { TIME_LEGEND } from "./types";

export type ExportRow = { fio: string; values: string[]; hours: number; days: number };

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
        cell(r.values[i] ?? "", { center: true, fill: weekend[i] ? "F0EDF5" : undefined }),
      ),
      cell(r.hours, { center: true, bold: true }),
      cell(r.days, { center: true, bold: true }),
    ]);
  }

  aoa.push([]);
  aoa.push([cell("Условные обозначения:", { bold: true, border: false })]);
  for (const l of TIME_LEGEND) {
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
) {
  return buildSheet(
    year,
    month,
    rows,
    normDays,
    `Табель АРВ ${MONTHS[month]} ${year} (норма ${normDays} р.д./${normDays * 8} ч)`,
  );
}

export function downloadMonth(
  year: number,
  month: number,
  rows: ExportRow[],
  normDays: number,
) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    buildMonthSheet(year, month, rows, normDays),
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
