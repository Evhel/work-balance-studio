import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Contractor, Employee, Project, Store } from "./types";
import { isWeekendDate } from "./dates";

const KEY = "arv-workload-store-v1";

const PALETTE = [
  "#520099",
  "#0e7490",
  "#b45309",
  "#be123c",
  "#15803d",
  "#7c3aed",
  "#0369a1",
  "#a16207",
];

export function projectColor(index: number) {
  return PALETTE[index % PALETTE.length]!;
}

function seed(): Store {
  const employees: Employee[] = [
    ["Иванов", "Иван", "Иванович", "ГИП", "Директор", true, "1978-04-12"],
    ["Петрова", "Анна", "Сергеевна", "Офис", "Офис-менеджер", true, "1990-08-03"],
    ["Сидоров", "Пётр", "Алексеевич", "АР", "Руководитель отдела", true, "1985-11-21"],
    ["Кузнецова", "Мария", "Ивановна", "КР", "Сотрудник", true, "1993-02-17"],
    ["Смирнов", "Олег", "Дмитриевич", "ОВ", "Сотрудник", false, "1996-06-30"],
    ["Волкова", "Елена", "Павловна", "ГИП", "Сотрудник", true, "1988-09-09"],
    ["Морозов", "Артём", "Юрьевич", "ЭОМ", "Модератор", true, "1991-12-25"],
  ].map((r, i) => ({
    id: `e${i + 1}`,
    lastName: r[0] as string,
    firstName: r[1] as string,
    middleName: r[2] as string,
    department: r[3] as string,
    position: r[4] as Employee["position"],
    fullTime: r[5] as boolean,
    birthDate: r[6] as string,
  }));

  const contractors: Contractor[] = [
    ["Абрамов", "Игорь", "Львович", "АР"],
    ["Гончарова", "Ольга", "Ивановна", "КР"],
    ["Дубов", "Сергей", "Петрович", "ВК"],
  ].map((r, i) => ({
    id: `c${i + 1}`,
    lastName: r[0]!,
    firstName: r[1]!,
    middleName: r[2]!,
    department: r[3]!,
    projectId: i === 0 ? "p1" : "p2",
  }));

  const y = new Date().getFullYear();
  const projects: Project[] = [
    {
      id: "p1",
      name: "ЖК «Северный»",
      color: PALETTE[0]!,
      stage: "ПД",
      start: `${y}-01-15`,
      end: `${y}-08-30`,
      milestone: `${y}-05-20`,
      description: "",
      members: [
        { personId: "e3", kind: "employee" },
        { personId: "e4", kind: "employee" },
        { personId: "c1", kind: "contractor" },
      ],
    },
    {
      id: "p2",
      name: "Технопарк «Восток»",
      color: PALETTE[1]!,
      stage: "Концепция",
      start: `${y}-04-01`,
      end: `${y}-12-15`,
      milestone: `${y}-09-10`,
      description: "",
      members: [
        { personId: "e6", kind: "employee" },
        { personId: "e5", kind: "employee" },
        { personId: "c2", kind: "contractor" },
      ],
    },
    {
      id: "p3",
      name: "Школа №42",
      color: PALETTE[2]!,
      stage: "РД",
      start: `${y - 1}-09-01`,
      end: `${y}-03-01`,
      description: "",
      members: [{ personId: "e7", kind: "employee" }],
    },
  ];

  return {
    employees,
    contractors,
    projects,
    timesheet: {},
    dayOverrides: {},
    plan: {},
    personalEvents: {},
    currentUserId: "e2",
  };
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

export type Action =
  | "editTimesheet"
  | "editContractors"
  | "createProject"
  | "editProject"
  | "editDepartment"
  | "deleteEntities";


const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<Store>(() => seed());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setStore({ ...seed(), ...JSON.parse(raw) });
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
      const isGip = currentUser?.department === "ГИП";
      const chiefs = p === "Директор" || p === "Модератор" || p === "Руководитель отдела";
      switch (action) {
        case "editTimesheet":
          return p === "Офис-менеджер";
        case "editContractors":
          return chiefs || isGip;
        case "createProject":
        case "editProject":
          return chiefs || isGip;
        case "editDepartment":
          return chiefs || isGip;
        case "deleteEntities":
          return p === "Модератор";
        default:
          return false;
      }
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

export function fio(p: { lastName: string; firstName: string; middleName?: string }) {
  return [p.lastName, p.firstName, p.middleName].filter(Boolean).join(" ");
}

export function byFio(a: { lastName: string; firstName: string }, b: typeof a) {
  return fio(a).localeCompare(fio(b), "ru");
}
