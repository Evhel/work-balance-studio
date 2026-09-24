import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import type { AccessAction, Employee, Project, Store } from "./types";
import { isWeekendDate } from "./dates";
import { PALETTE, projectColor } from "./seed";
import { supabase } from "@/integrations/supabase/client";
import { employeeToRow, rowToEmployee, sameEmployee, type ProfileRow } from "./profiles";
import {
  emptySharedStore,
  loadSharedRecords,
  persistSharedChanges,
  sharedRecordsFromStore,
  sharedStoreFromRecords,
  type SharedRecord,
} from "./shared-data";

const KEY = "arv-workload-store-v3";

export { PALETTE, projectColor };

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
  /** id вошедшего пользователя (null — не авторизован) */
  authUserId: string | null;
  /** логины сотрудников: id -> логин */
  logins: Record<string, string>;
  /** перечитать список сотрудников из базы */
  reloadEmployees: () => Promise<void>;
  signOut: () => Promise<void>;
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
      return position === "Офис-менеджер" || position === "Модератор";
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
  const [store, setStore] = useState<Store>(() => emptySharedStore());
  const [sharedLoaded, setSharedLoaded] = useState(false);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [logins, setLogins] = useState<Record<string, string>>({});
  const syncedRef = useRef<Record<string, Employee>>({});
  const sharedSnapshotRef = useRef<Map<string, SharedRecord>>(new Map());
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const reloadTimerRef = useRef<number | null>(null);

  const loadSharedData = async (userId: string) => {
    const rows = await loadSharedRecords();
    const shared = sharedStoreFromRecords(rows, userId);
    sharedSnapshotRef.current = sharedRecordsFromStore(shared, userId);
    setStore((prev) => ({ ...shared, employees: prev.employees }));
    setSharedLoaded(true);
    // Старый браузерный набор больше не является источником данных.
    localStorage.removeItem(KEY);
  };

  const loadProfiles = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id,username,last_name,first_name,middle_name,department,position,full_time,track_effort,start_work,end_work,comment,hidden,remote_days",
      );
    if (error || !data) return;
    const rows = (data as unknown as ProfileRow[]).map(rowToEmployee);
    rows.sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "ru"));
    const employees: Employee[] = rows.map(({ login: _login, ...rest }) => rest);
    syncedRef.current = Object.fromEntries(employees.map((e) => [e.id, e]));
    setLogins(Object.fromEntries(rows.map((r) => [r.id, r.login])));
    setStore((prev) => ({ ...prev, employees }));
  };

  useEffect(() => {
    const apply = (userId: string | null) => {
      setAuthUserId(userId);
      if (userId) {
        setSharedLoaded(false);
        setStore((prev) => ({ ...prev, currentUserId: userId }));
        void Promise.all([loadProfiles(), loadSharedData(userId)]).catch((error: unknown) => {
          console.error("Could not load shared application data", error);
          toast.error("Не удалось загрузить общие данные из базы");
        });
      } else {
        syncedRef.current = {};
        sharedSnapshotRef.current = new Map();
        setLogins({});
        setSharedLoaded(false);
        setStore(emptySharedStore());
      }
    };
    void supabase.auth.getSession().then(({ data }) => apply(data.session?.user.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        apply(session?.user.id ?? null);
      }
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Каждое логическое значение хранится отдельной строкой PostgreSQL. Снимок
  // позволяет отправлять только добавленные, изменённые и удалённые строки.
  useEffect(() => {
    if (!authUserId || !sharedLoaded) return;
    const before = sharedSnapshotRef.current;
    const after = sharedRecordsFromStore(store, authUserId);
    sharedSnapshotRef.current = after;
    writeQueueRef.current = writeQueueRef.current
      .then(() => persistSharedChanges(before, after))
      .catch((error: unknown) => {
        console.error("Could not save shared application data", error);
        toast.error("Изменения не сохранились. Данные будут перечитаны из базы.");
        return loadSharedData(authUserId);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, authUserId, sharedLoaded]);

  // Изменения другого браузера появляются без перезагрузки страницы. Повторное
  // чтение ждёт завершения локальной очереди, чтобы не затереть ещё не отправленное.
  useEffect(() => {
    if (!authUserId || !sharedLoaded) return;
    const refresh = () => {
      if (reloadTimerRef.current !== null) window.clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = window.setTimeout(() => {
        reloadTimerRef.current = null;
        void writeQueueRef.current
          .then(() => loadSharedData(authUserId))
          .catch((error: unknown) => console.error("Could not refresh shared data", error));
      }, 250);
    };
    const channel = supabase
      .channel("app-records")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_records" },
        refresh,
      )
      .subscribe();
    window.addEventListener("focus", refresh);
    return () => {
      if (reloadTimerRef.current !== null) window.clearTimeout(reloadTimerRef.current);
      window.removeEventListener("focus", refresh);
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUserId, sharedLoaded]);

  // изменения карточек сотрудников сохраняем в базу
  useEffect(() => {
    if (!authUserId) return;
    const changed = store.employees.filter((e) => {
      const known = syncedRef.current[e.id];
      return known && !sameEmployee(known, e);
    });
    if (!changed.length) return;
    for (const e of changed) syncedRef.current[e.id] = e;
    void (async () => {
      for (const e of changed) {
        await supabase.from("profiles").update(employeeToRow(e) as never).eq("id", e.id);
      }
    })();
  }, [store.employees, authUserId]);

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

    const fallbackUser: Employee = {
      id: authUserId ?? "",
      lastName: "",
      firstName: "",
      middleName: "",
      department: "",
      position: "Сотрудник",
      fullTime: true,
      trackEffort: true,
      birthDate: "",
    };
    const currentUser =
      store.employees.find((e) => e.id === store.currentUserId) ??
      store.employees[0] ??
      fallbackUser;

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
      authUserId,
      logins,
      reloadEmployees: loadProfiles,
      signOut: async () => {
        await supabase.auth.signOut();
      },
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
      removeEmployee: (id) => {
        delete syncedRef.current[id];
        void import("./auth.functions").then(({ deleteEmployeeAccount }) =>
          deleteEmployeeAccount({ data: { userId: id } }).catch(() => {}),
        );
        update((d) => {
          d.employees = d.employees.filter((e) => e.id !== id);
          delete d.timesheet[id];
          delete d.personalEvents[id];
          for (const pid of Object.keys(d.plan)) delete d.plan[pid]![id];
          d.projects.forEach((p) => (p.members = p.members.filter((m) => m.personId !== id)));
        });
      },
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

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, authUserId, logins]);

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
