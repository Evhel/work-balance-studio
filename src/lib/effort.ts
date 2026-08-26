import type { EffortRow, Store } from "./types";
import { pad } from "./dates";

export function ymKey(year: number, month: number) {
  return `${year}-${pad(month + 1)}`;
}

export function parseYm(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return { year: y!, month: m! - 1 };
}

export function ymValue(ym: string) {
  const { year, month } = parseYm(ym);
  return year * 12 + month;
}

export function effortRows(store: Store, personId: string, ym: string): EffortRow[] {
  return store.effort[personId]?.[ym] ?? [];
}

export function rowTotal(row: EffortRow) {
  return Object.values(row.hours).reduce((a, b) => a + (Number(b) || 0), 0);
}

export function isEffortDone(store: Store, personId: string, ym: string) {
  return !!store.effortDone[personId]?.[ym];
}

/** Все виды работ, которые сотрудник когда-либо использовал */
export function workTypeSuggestions(store: Store, personId: string) {
  const set = new Set<string>();
  for (const rows of Object.values(store.effort[personId] ?? {}))
    for (const r of rows) if (r.workType.trim()) set.add(r.workType.trim());
  return [...set].sort((a, b) => a.localeCompare(b, "ru"));
}

export type EffortFact = {
  personId: string;
  projectId: string;
  department: string;
  workType: string;
  stage: string;
  ym: string;
  hours: number;
};

/** Плоский список фактических трудозатрат по всем сотрудникам */
export function allFacts(store: Store): EffortFact[] {
  const dept = new Map<string, string>();
  store.employees.forEach((e) => dept.set(e.id, e.department));
  store.contractors.forEach((c) => dept.set(c.id, c.department));

  const out: EffortFact[] = [];
  for (const [personId, byMonth] of Object.entries(store.effort)) {
    for (const [ym, rows] of Object.entries(byMonth ?? {})) {
      for (const r of rows) {
        const hours = rowTotal(r);
        if (!hours || !r.projectId) continue;
        out.push({
          personId,
          projectId: r.projectId,
          department: dept.get(personId) ?? "—",
          workType: r.workType || "—",
          stage: r.stage || "",
          ym,
          hours,
        });
      }
    }
  }
  return out;
}
