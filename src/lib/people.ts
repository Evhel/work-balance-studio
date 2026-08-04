import type { Store, Employee } from "./types";
import { ABSENCE_CODES } from "./types";
import { fio } from "./store";

export type Person = {
  id: string;
  name: string;
  department: string;
  kind: "employee" | "contractor";
};

export function allPeople(store: Store): Person[] {
  return [
    ...store.employees
      .filter((e) => !e.hidden)
      .map((e) => ({
        id: e.id,
        name: fio(e),
        department: e.department,
        kind: "employee" as const,
      })),
    ...store.contractors
      .filter((c) => !c.hidden)
      .map((c) => ({
        id: c.id,
        name: fio(c),
        department: c.department,
        kind: "contractor" as const,
      })),
  ];
}

export function findPerson(store: Store, id: string) {
  return allPeople(store).find((p) => p.id === id);
}

/** Работает ли сотрудник в этот день (учёт дат начала и окончания работы) */
export function isEmployedOn(emp: Employee, date: string) {
  if (emp.startWork && date < emp.startWork) return false;
  if (emp.endWork && date > emp.endWork) return false;
  return true;
}

/** Код отсутствия (Б/ОТ/ДО/У) из табелей стр.1 и стр.3 */
export function absenceAt(store: Store, personId: string, date: string) {
  const v = store.timesheet[personId]?.[date];
  return v && ABSENCE_CODES.includes(v) ? v : "";
}

/** Проекты, на которых человек занят в этот день */
export function projectsAt(store: Store, personId: string, date: string) {
  return store.projects.filter((p) => store.plan[p.id]?.[personId]?.[date] === "Р");
}
