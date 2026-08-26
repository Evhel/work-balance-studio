import type { Contractor, Employee, EffortRow, Project, Store } from "./types";
import { isWeekendDate, pad } from "./dates";
import { CHART_COLORS } from "./colors";

export const PALETTE = CHART_COLORS;


export function projectColor(index: number) {
  return PALETTE[index % PALETTE.length]!;
}

/** Детерминированный ГПСЧ, чтобы демо-данные не «прыгали» */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORK_TYPES: Record<string, string[]> = {
  АР: ["Разработка чертежей", "Планировочные решения", "Согласование с заказчиком"],
  КР: ["Расчёт схемы", "Конструктивные узлы", "Проверка расчётов"],
  ГИП: ["Управление проектом", "Проверка комплекта", "Совещание с заказчиком"],
  BIM: ["BIM-координация", "Разработка шаблонов", "Проверка модели"],
  ОВ: ["Расчёт систем", "Разработка чертежей"],
  ЭОМ: ["Расчёт нагрузок", "Разработка чертежей"],
  ВК: ["Разработка чертежей", "Расчёт систем"],
  Офис: ["Организационная работа"],
};

const NO_OBJECT_TYPES = [
  "Совещания",
  "Разработка шаблонов",
  "Оценка проекта",
  "Обучение",
  "Внутренние задачи",
];

function makeEmployees(): Employee[] {
  const rows: [string, string, string, string, Employee["position"], boolean, string][] = [
    ["Иванов", "Иван", "Иванович", "ГИП", "Директор", true, "1978-04-12"],
    ["Петрова", "Анна", "Сергеевна", "Офис", "Офис-менеджер", true, "1990-08-03"],
    ["Сидоров", "Пётр", "Алексеевич", "АР", "Руководитель отдела", true, "1985-11-21"],
    ["Кузнецова", "Мария", "Ивановна", "КР", "Сотрудник", true, "1993-02-17"],
    ["Смирнов", "Олег", "Дмитриевич", "ОВ", "Сотрудник", false, "1996-06-30"],
    ["Волкова", "Елена", "Павловна", "ГИП", "Сотрудник", true, "1988-09-09"],
    ["Морозов", "Артём", "Юрьевич", "ЭОМ", "Модератор", true, "1991-12-25"],
    // АР +4
    ["Ковалёв", "Денис", "Олегович", "АР", "Сотрудник", true, "1992-03-14"],
    ["Никитина", "Юлия", "Андреевна", "АР", "Сотрудник", true, "1994-07-22"],
    ["Романов", "Кирилл", "Игоревич", "АР", "Сотрудник", true, "1989-01-08"],
    ["Белова", "Дарья", "Максимовна", "АР", "Сотрудник", true, "1997-10-05"],
    // КР +4 (один руководитель)
    ["Захаров", "Михаил", "Петрович", "КР", "Руководитель отдела", true, "1983-05-19"],
    ["Орлова", "Светлана", "Викторовна", "КР", "Сотрудник", true, "1995-04-02"],
    ["Тимофеев", "Роман", "Сергеевич", "КР", "Сотрудник", true, "1990-11-11"],
    ["Лебедев", "Антон", "Валерьевич", "КР", "Сотрудник", true, "1998-08-27"],
    // ГИП +4 (один руководитель)
    ["Григорьев", "Сергей", "Николаевич", "ГИП", "Руководитель отдела", true, "1980-02-28"],
    ["Фомина", "Ирина", "Олеговна", "ГИП", "Сотрудник", true, "1987-06-16"],
    ["Егоров", "Владимир", "Ильич", "ГИП", "Сотрудник", true, "1992-09-23"],
    ["Соколова", "Наталья", "Юрьевна", "ГИП", "Сотрудник", true, "1993-12-07"],
    // BIM руководитель
    ["Панкратов", "Алексей", "Викторович", "BIM", "Руководитель отдела", true, "1986-03-31"],
  ];
  return rows.map((r, i) => ({
    id: `e${i + 1}`,
    lastName: r[0],
    firstName: r[1],
    middleName: r[2],
    department: r[3],
    position: r[4],
    fullTime: r[5],
    birthDate: r[6],
  }));
}

function makeContractors(): Contractor[] {
  return [
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
}

export const NO_OBJECT_ID = "p-no-object";

function makeProjects(y: number): Project[] {
  const base: Project[] = [
    {
      id: "p1",
      name: "ЖК «Северный»",
      color: PALETTE[0]!,
      stages: ["ПД", "Экспертиза"],
      start: `${y}-01-15`,
      end: `${y}-08-30`,
      milestone: `${y}-05-20`,
      description: "",
      members: [],
    },
    {
      id: "p2",
      name: "Технопарк «Восток»",
      color: PALETTE[1]!,
      stages: ["ОТР"],
      start: `${y}-04-01`,
      end: `${y}-12-15`,
      milestone: `${y}-09-10`,
      description: "",
      members: [],
    },
    {
      id: "p3",
      name: "Школа №42",
      color: PALETTE[2]!,
      stages: ["РД", "ВОРы"],
      start: `${y - 1}-09-01`,
      end: `${y}-03-01`,
      description: "",
      members: [],
    },
  ];

  const extra: [string, Project["stages"], string, string][] = [
    ["Поликлиника на ул. Мира", ["РД", "АН"], `${y - 1}-04-10`, `${y}-01-25`],
    ["БЦ «Меридиан»", ["ПД", "Экспертиза"], `${y}-01-10`, `${y + 1}-04-30`],
    ["ЖК «Прибрежный»", ["РД"], `${y}-02-01`, `${y + 1}-06-30`],
    ["Гостиница «Панорама»", ["РД", "ВОРы"], `${y}-02-15`, `${y + 1}-05-15`],
    ["ТЦ «Галерея»", ["ПД"], `${y}-01-05`, `${y + 1}-01-31`],
  ];

  const projects = base.concat(
    extra.map((r, i) => ({
      id: `p${i + 4}`,
      name: r[0],
      color: PALETTE[(i + 3) % PALETTE.length]!,
      stages: r[1],
      start: r[2],
      end: r[3],
      description: "",
      members: [],
    })),
  );

  projects.push({
    id: NO_OBJECT_ID,
    name: "Без объекта",
    color: "#64748b",
    stages: ["ОТР"],
    start: `${y - 1}-01-01`,
    end: `${y + 1}-12-31`,
    description: "Внутренние работы: совещания, шаблоны, оценка проектов",
    members: [],
  });

  return projects;
}

function monthsBetween(startIso: string, endIso: string) {
  const [sy, sm] = startIso.split("-").map(Number);
  const [ey, em] = endIso.split("-").map(Number);
  const out: { year: number; month: number }[] = [];
  let cur = sy! * 12 + (sm! - 1);
  const last = ey! * 12 + (em! - 1);
  while (cur <= last) {
    out.push({ year: Math.floor(cur / 12), month: cur % 12 });
    cur++;
  }
  return out;
}

/** Генерация демо-трудозатрат: у каждого сотрудника полного дня 8 часов в рабочий день */
function makeEffort(employees: Employee[], projects: Project[]) {
  const rand = rng(20260806);
  const effort: Store["effort"] = {};
  const effortDone: Store["effortDone"] = {};

  const now = new Date();
  const nowKey = now.getFullYear() * 12 + now.getMonth();

  const byDept = new Map<string, Employee[]>();
  for (const e of employees) {
    if (e.department === "Офис") continue;
    const list = byDept.get(e.department) ?? [];
    list.push(e);
    byDept.set(e.department, list);
  }

  const bim = employees.find((e) => e.department === "BIM")!;
  const real = projects.filter((p) => p.id !== NO_OBJECT_ID);

  /** проекты каждого сотрудника */
  const assign = new Map<string, Project[]>();
  const addTo = (empId: string, p: Project) => {
    const list = assign.get(empId) ?? [];
    if (!list.includes(p)) list.push(p);
    assign.set(empId, list);
  };

  for (const p of real) {
    for (const dept of ["АР", "КР", "ГИП"]) {
      const pool = [...(byDept.get(dept) ?? [])];
      const count = 1 + Math.floor(rand() * 3); // 1..3
      for (let i = 0; i < count && pool.length; i++) {
        const idx = Math.floor(rand() * pool.length);
        const emp = pool.splice(idx, 1)[0]!;
        addTo(emp.id, p);
        p.members.push({ personId: emp.id, kind: "employee" });
      }
    }
    // BIM-руководитель — на всех проектах
    addTo(bim.id, p);
    p.members.push({ personId: bim.id, kind: "employee" });

    // прочие отделы — по одному человеку
    for (const dept of ["ОВ", "ЭОМ"]) {
      const pool = byDept.get(dept) ?? [];
      if (pool.length && rand() > 0.4) {
        const emp = pool[Math.floor(rand() * pool.length)]!;
        addTo(emp.id, p);
        p.members.push({ personId: emp.id, kind: "employee" });
      }
    }
  }

  for (const emp of employees) {
    const projs = assign.get(emp.id) ?? [];
    if (!projs.length && emp.department === "Офис") continue;
    const types = WORK_TYPES[emp.department] ?? ["Работа по проекту"];
    const monthsSet = new Set<string>();
    for (const p of projs) for (const m of monthsBetween(p.start, p.end)) monthsSet.add(`${m.year}-${pad(m.month + 1)}`);

    for (const ym of [...monthsSet].sort()) {
      const [yy, mm] = ym.split("-").map(Number);
      const year = yy!;
      const month = mm! - 1;
      if (year * 12 + month > nowKey) continue;
      const active = projs.filter((p) => p.start.slice(0, 7) <= ym && p.end.slice(0, 7) >= ym);
      if (!active.length) continue;

      const dim = new Date(year, month + 1, 0).getDate();
      const maxDay = year * 12 + month === nowKey ? Math.min(dim, now.getDate()) : dim;
      const rowsMap = new Map<string, EffortRow>();
      const put = (projectId: string, workType: string, day: number, hours: number) => {
        const pr = projects.find((x) => x.id === projectId);
        const stage = pr?.stages?.[day % (pr.stages.length || 1)] ?? pr?.stages?.[0] ?? "";
        const key = `${projectId}|${stage}|${workType}`;
        let row = rowsMap.get(key);
        if (!row) {
          row = { id: `s_${emp.id}_${ym}_${rowsMap.size}`, projectId, stage, workType, hours: {} };
          rowsMap.set(key, row);
        }
        row.hours[String(day)] = (row.hours[String(day)] ?? 0) + hours;
      };

      for (let d = 1; d <= maxDay; d++) {
        if (isWeekendDate(year, month, d)) continue;
        const total = emp.fullTime ? 8 : 4;
        if (d % 7 === 3) {
          put(NO_OBJECT_ID, NO_OBJECT_TYPES[Math.floor(rand() * NO_OBJECT_TYPES.length)]!, d, total);
          continue;
        }
        if (active.length > 1 && rand() > 0.6) {
          const a = active[d % active.length]!;
          const b = active[(d + 1) % active.length]!;
          put(a.id, types[d % types.length]!, d, total / 2);
          put(b.id, types[(d + 1) % types.length]!, d, total / 2);
        } else {
          const p = active[d % active.length]!;
          put(p.id, types[d % types.length]!, d, total);
        }
      }

      const rows = [...rowsMap.values()];
      if (!rows.length) continue;
      effort[emp.id] = effort[emp.id] ?? {};
      effort[emp.id]![ym] = rows;
      if (year * 12 + month < nowKey) {
        effortDone[emp.id] = effortDone[emp.id] ?? {};
        effortDone[emp.id]![ym] = true;
      }
    }
  }

  return { effort, effortDone };
}

/** Демо-план занятости: у каждого участника проекта занятость по будням внутри срока проекта */
function makePlan(projects: Project[], contractors: Contractor[], year: number) {
  const rand = rng(777);
  const plan: Store["plan"] = {};
  const yStart = `${year}-01-01`;
  const yEnd = `${year}-12-31`;

  for (const p of projects) {
    if (p.id === NO_OBJECT_ID) continue;
    const from = p.start > yStart ? p.start : yStart;
    const to = p.end < yEnd ? p.end : yEnd;
    if (from > to) continue;
    plan[p.id] = plan[p.id] ?? {};

    for (const m of p.members) {
      // у каждого участника свой отрезок работы внутри срока проекта
      const skipStart = rand() < 0.35;
      const skipEnd = rand() < 0.35;
      const cells: Record<string, string> = {};
      const [fy, fm, fd] = from.split("-").map(Number);
      const [ty, tm, td] = to.split("-").map(Number);
      const cur = new Date(fy!, fm! - 1, fd!);
      const last = new Date(ty!, tm! - 1, td!);
      const days: { y: number; m: number; d: number }[] = [];
      while (cur <= last) {
        if (!isWeekendDate(cur.getFullYear(), cur.getMonth(), cur.getDate()))
          days.push({ y: cur.getFullYear(), m: cur.getMonth(), d: cur.getDate() });
        cur.setDate(cur.getDate() + 1);
      }
      const startIdx = skipStart ? Math.floor(days.length * 0.2) : 0;
      const endIdx = skipEnd ? Math.floor(days.length * 0.8) : days.length;
      for (let i = startIdx; i < endIdx; i++) {
        const dd = days[i]!;
        cells[`${dd.y}-${pad(dd.m + 1)}-${pad(dd.d)}`] = "Р";
      }
      if (Object.keys(cells).length) plan[p.id]![m.personId] = cells;
    }
  }

  // подрядчики видны в плане своего проекта
  for (const c of contractors) {
    if (!c.projectId) continue;
    const p = projects.find((x) => x.id === c.projectId);
    if (!p) continue;
    if (!p.members.some((m) => m.personId === c.id))
      p.members.push({ personId: c.id, kind: "contractor" });
    plan[p.id] = plan[p.id] ?? {};
    if (!plan[p.id]![c.id]) {
      const src = Object.values(plan[p.id]!)[0] ?? {};
      plan[p.id]![c.id] = { ...src };
    }
  }

  return plan;
}

export function seedStore(): Store {
  const employees = makeEmployees();
  const contractors = makeContractors();
  const y = new Date().getFullYear();
  const projects = makeProjects(y);
  const { effort, effortDone } = makeEffort(employees, projects);
  const plan = makePlan(projects, contractors, y);

  return {
    employees,
    contractors,
    projects,
    timesheet: {},
    remoteOverride: {},

    dayOverrides: {},
    plan,
    personalEvents: {},
    effort,
    effortDone,
    filterSets: [],
    access: {},
    currentUserId: "e7",
  };
}
