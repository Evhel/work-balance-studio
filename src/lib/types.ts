export type Position =
  | "Директор"
  | "Модератор"
  | "Руководитель отдела"
  | "Сотрудник"
  | "Офис-менеджер";

export const POSITIONS: Position[] = [
  "Директор",
  "Модератор",
  "Руководитель отдела",
  "Сотрудник",
  "Офис-менеджер",
];

export type Employee = {
  id: string;
  lastName: string;
  firstName: string;
  middleName: string;
  department: string;
  position: Position;
  fullTime: boolean;
  birthDate: string; // YYYY-MM-DD
  /** Дата начала работы */
  startWork?: string;
  /** Дата окончания работы */
  endWork?: string;
  comment?: string;
  hidden?: boolean;
  avatar?: string;
};

export type Contractor = {
  id: string;
  lastName: string;
  firstName: string;
  middleName: string;
  department: string;
  projectId?: string;
  comment?: string;
  hidden?: boolean;
};


export type ProjectStage = "Концепция" | "ПД" | "РД";

export type ProjectMember = { personId: string; kind: "employee" | "contractor" };

/** Цель (веха) проекта с датой и названием */
export type ProjectGoal = { id: string; date: string; name: string };

export type Project = {
  id: string;
  name: string;
  color: string;
  stage: ProjectStage;
  start: string; // YYYY-MM-DD
  end: string;
  milestone?: string;
  /** Несколько именованных целей */
  goals?: ProjectGoal[];
  description?: string;
  image?: string;
  /** Проект на паузе */
  paused?: boolean;
  members: ProjectMember[];

};


/** Коды табеля рабочего времени (стр. 1) */
export const TIME_CODES = ["Б", "ОТ", "ДО", "НН", "ОЖ", "У"] as const;
export type TimeCode = (typeof TIME_CODES)[number];

export const TIME_LEGEND: { code: string; label: string }[] = [
  { code: "Б", label: "больничный лист" },
  { code: "ОТ", label: 'отпуск оплачиваемый' },
  { code: "ДО", label: 'отпуск "за свой счет"' },
  { code: "8", label: "отработанное время, час" },
  { code: "НН", label: "неявка" },
  { code: "ОЖ", label: "отпуск по уходу за ребенком" },
  { code: "У", label: "учебный отпуск" },
];

export const CONTRACTOR_LEGEND: { code: string; label: string }[] = [
  { code: "Б", label: "больничный" },
  { code: "ОТ", label: "отпуск запланированный" },
  { code: "НН", label: "неявка" },
];

export const CODE_COLORS: Record<string, string> = {
  "Б": "#fde2e2",
  "ОТ": "#d8f0dc",
  "ДО": "#e4e0f5",
  "НН": "#ffe0b2",
  "ОЖ": "#ffd9ef",
  "У": "#d7ecff",
  "Р": "#c9f2cf",
};

export const ABSENCE_CODES = ["Б", "ОТ", "ДО", "У"];

/** Строка табеля трудозатрат */
export type EffortRow = {
  id: string;
  projectId: string;
  /** Вид работ (свободный текст) */
  workType: string;
  /** день месяца (1..31) -> часы */
  hours: Record<string, number>;
};

/** Сохранённый набор фильтров дашбордов */
export type FilterSet = {
  id: string;
  name: string;
  unit: "hours" | "days";
  depts: string[];
  projects: string[];
  people: string[];
  from: string; // YYYY-MM
  to: string; // YYYY-MM
};

export type Store = {
  employees: Employee[];
  contractors: Contractor[];
  projects: Project[];
  /** personId -> 'YYYY-MM-DD' -> код или число часов */
  timesheet: Record<string, Record<string, string>>;
  /** 'YYYY-MM-DD' -> ручной статус дня */
  dayOverrides: Record<string, "work" | "off">;
  /** projectId -> personId -> дата -> 'Р' */
  plan: Record<string, Record<string, Record<string, string>>>;
  /** personId -> дата -> личное событие */
  personalEvents: Record<string, Record<string, string>>;
  /** personId -> 'YYYY-MM' -> строки трудозатрат */
  effort: Record<string, Record<string, EffortRow[]>>;
  /** personId -> 'YYYY-MM' -> «трудозатраты заполнены» */
  effortDone: Record<string, Record<string, boolean>>;
  /** Сохранённые наборы фильтров дашбордов */
  filterSets: FilterSet[];
  currentUserId: string;
};

