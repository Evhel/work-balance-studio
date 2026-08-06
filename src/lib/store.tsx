import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AccessAction, Employee, Store } from "./types";
import { isWeekendDate } from "./dates";
import { seedStore, PALETTE, projectColor } from "./seed";

const KEY = "arv-workload-store-v2";

export { PALETTE, projectColor };

function seed(): Store {
  return seedStore();
}


type Ctx = {
  store: Store;
  update: (fn: (draft: Store) => void) => void;
  isWorkday: (dateIso: string) => boolean;
  toggleDay: (dateIso: string) => void;
  setCells: (personId: string, dates: string[], value: string | null) => void;
  setPlanCells: (projectId: string, personId: string, dates: string[], value: string | null) => void;
  removeEmployee: (id: string) => void;
  removeContractor: (id: string) => void;
  removeProject: (id: string) => void;
  currentUser: Employee;
  can: (action: Action) => boolean;
};

export type Action = AccessAction;

/** Права по умолчанию для должности */
export function defaultAccess(
  position: Employee["position"],
  department: string,
  action: AccessAction,
): boolean {
  const isGip = department === "ГИП";
  const chiefs =
    position === "Директор" || position === "Модератор" || position === "Руководитель отдела";
  switch (action) {
    case "viewTimesheet":
    case "viewContractors":
    case "viewEffort":
    case "viewDashboards":
      return true;
    case "editTimesheet":
      return position === "Офис-менеджер";
    case "editContractors":
    case "createProject":
    case "editProject":
    case "editDepartment":
      return chiefs || isGip;
    case "editEffort":
      return chiefs;
    case "editEmployeeCard":
      return position === "Офис-менеджер";
    case "deleteEntities":
    case "manageRoles":
      return position === "Модератор";
    default:
      return false;
  }
}



const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<Store>(() => seed());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Store>;
        const base = seed();
        setStore({
          ...base,
          ...parsed,
          effort: parsed.effort ?? base.effort,
          effortDone: parsed.effortDone ?? base.effortDone,
          remoteOverride: parsed.remoteOverride ?? {},
          filterSets: parsed.filterSets ?? [],
          access: parsed.access ?? {},


        });
      }
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(store));
    } catch {
      /* ignore */
    }
  }, [store, loaded]);

  const value = useMemo<Ctx>(() => {
    const update = (fn: (draft: Store) => void) =>
      setStore((prev) => {
        const draft: Store = JSON.parse(JSON.stringify(prev));
        fn(draft);
        return draft;
      });

    const isWorkday = (dateIso: string) => {
      const ov = store.dayOverrides[dateIso];
      if (ov) return ov === "work";
      const [yy, mm, dd] = dateIso.split("-").map(Number);
      return !isWeekendDate(yy!, mm! - 1, dd!);
    };

    const currentUser =
      store.employees.find((e) => e.id === store.currentUserId) ?? store.employees[0]!;

    const can = (action: Action): boolean => {
      const p = currentUser?.position;
      if (!p) return false;
      const override = store.access?.[p]?.[action];
      if (typeof override === "boolean") return override;
      return defaultAccess(p, currentUser.department, action);
    };


    return {
      store,
      update,
      isWorkday,
      currentUser,
      can,
      toggleDay: (dateIso) =>
        update((d) => {
          d.dayOverrides[dateIso] = isWorkday(dateIso) ? "off" : "work";
        }),
      setCells: (personId, dates, val) =>
        update((d) => {
          d.timesheet[personId] = d.timesheet[personId] ?? {};
          for (const date of dates) {
            if (val === null) delete d.timesheet[personId]![date];
            else d.timesheet[personId]![date] = val;
          }
        }),
      setPlanCells: (projectId, personId, dates, val) =>
        update((d) => {
          d.plan[projectId] = d.plan[projectId] ?? {};
          d.plan[projectId]![personId] = d.plan[projectId]![personId] ?? {};
          for (const date of dates) {
            if (val === null) delete d.plan[projectId]![personId]![date];
            else d.plan[projectId]![personId]![date] = val;
          }
        }),
      removeEmployee: (id) =>
        update((d) => {
          d.employees = d.employees.filter((e) => e.id !== id);
          delete d.timesheet[id];
          delete d.personalEvents[id];
          for (const pid of Object.keys(d.plan)) delete d.plan[pid]![id];
          d.projects.forEach((p) => (p.members = p.members.filter((m) => m.personId !== id)));
        }),
      removeContractor: (id) =>
        update((d) => {
          d.contractors = d.contractors.filter((c) => c.id !== id);
          delete d.timesheet[id];
          for (const pid of Object.keys(d.plan)) delete d.plan[pid]![id];
          d.projects.forEach((p) => (p.members = p.members.filter((m) => m.personId !== id)));
        }),
      removeProject: (id) =>
        update((d) => {
          d.projects = d.projects.filter((p) => p.id !== id);
          delete d.plan[id];
          d.contractors.forEach((c) => {
            if (c.projectId === id) delete c.projectId;
          });
        }),
    };

  }, [store]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}

/** Фамилия и имя (отчество не отображается) */
export function fio(p: { lastName: string; firstName: string; middleName?: string }) {
  return [p.lastName, p.firstName].filter(Boolean).join(" ");
}

/** Дата рождения без года: ДД.ММ */
export function birthDayMonth(birthDate?: string) {
  if (!birthDate) return "";
  return `${birthDate.slice(8, 10)}.${birthDate.slice(5, 7)}`;
}


export function byFio(a: { lastName: string; firstName: string }, b: typeof a) {
  return fio(a).localeCompare(fio(b), "ru");
}
