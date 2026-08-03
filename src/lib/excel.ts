import * as XLSX from "xlsx";
import { MONTHS, daysInMonth, iso } from "./dates";
import { TIME_LEGEND } from "./types";

export type ExportRow = { fio: string; values: string[]; hours: number; days: number };

export function buildMonthSheet(
  year: number,
  month: number,
  rows: ExportRow[],
  normDays: number,
) {
  const dim = daysInMonth(year, month);
  const aoa: (string | number)[][] = [];
  aoa.push([
    `Табель АРВ ${MONTHS[month]} ${year} (норма ${normDays} р.д./${normDays * 8} ч)`,
  ]);
  aoa.push([]);
  aoa.push([
    "ФИО",
    ...Array.from({ length: dim }, (_, i) => i + 1),
    "часы",
    "р.дни",
  ]);
  for (const r of rows) {
    aoa.push([r.fio, ...r.values, r.hours, r.days]);
  }
  aoa.push([]);
  aoa.push(["Условные обозначения:"]);
  for (const l of TIME_LEGEND) aoa.push([l.code, l.label]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 28 }, ...Array.from({ length: dim + 2 }, () => ({ wch: 4 }))];
  return ws;
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
      // попробуем имя листа вида "2025-03" или название месяца
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
    header.forEach((cell, idx) => {
      const n = Number(cell);
      if (idx > 0 && Number.isInteger(n) && n >= 1 && n <= 31) dayCols.push({ col: idx, day: n });
    });

    for (let r = headerIdx + 1; r < aoa.length; r++) {
      const row = aoa[r]!;
      const fio = String(row?.[0] ?? "").trim();
      if (!fio || fio.startsWith("Условные")) break;
      for (const dc of dayCols) {
        const v = row[dc.col];
        if (v === undefined || v === null || String(v).trim() === "") continue;
        out.push({ fio, date: iso(year, month, dc.day), value: String(v).trim() });
      }
    }
  }
  return out;
}
