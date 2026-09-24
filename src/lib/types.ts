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
  /** Включён ли сотрудник в учёт и отчёты по трудозатратам */
  trackEffort: boolean;
  /** Дата начала работы */
  startWork?: string;
  /** Дата окончания работы */
  endWork?: string;
  comment?: string;
  hidden?: boolean;
  avatar?: string;
  /** Дни регулярной удалёнки: 1 — Пн … 5 — Пт */
  remoteDays?: number[];
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


export type ProjectStage = "ОТР" | "ПД" | "РД" | "Экспертиза" | "ВОРы" | "АН";

export const PROJECT_STAGES: ProjectStage[] = ["ОТР", "ПД", "РД", "Экспертиза", "ВОРы", "АН"];

export type ProjectMember = { personId: string; kind: "employee" | "contractor" };

/** Цель (веха) проекта с датой и названием */
export type ProjectGoal = { id: string; date: string; name: string };

export type Project = {
  id: string;
  name: string;
  color: string;
  /** Стадии проекта (можно несколько) */
  stages: ProjectStage[];
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
export const TIME_CODES = ["Б", "Н", "ОТ", "ДО", "НН", "ОЖ", "У", "УД"] as const;
export type TimeCode = (typeof TIME_CODES)[number];

/** Код удалённой работы. Показывается только в табеле рабочего времени */
export const REMOTE_CODE = "УД";

export const TIME_LEGEND: { code: string; label: string }[] = [
  { code: "Б", label: "больничный лист" },
  { code: "Н", label: "неявка б" },
  { code: "ОТ", label: 'отпуск оплачиваемый' },
  { code: "ДО", label: 'отпуск "за свой счет"' },
  { code: "8", label: "отработанное время, час" },
  { code: "УД", label: "удалённая работа" },
  { code: "НН", label: "неявка" },
  { code: "ОЖ", label: "отпуск по уходу за ребенком" },
  { code: "У", label: "учебный отпуск" },
];

export const CONTRACTOR_LEGEND: { code: string; label: string }[] = [
  { code: "Б", label: "больничный" },
  { code: "Н", label: "неявка б" },
  { code: "ОТ", label: "отпуск запланированный" },
  { code: "НН", label: "неявка" },
];

export const CODE_COLORS: Record<string, string> = {
  "Б": "#fde2e2",
  "Н": "#fde2e2",
  "ОТ": "#d8f0dc",
  "ДО": "#e4e0f5",
  "НН": "#ffe0b2",
  "ОЖ": "#ffd9ef",
  "У": "#d7ecff",
  "УД": "#e8e3f7",
  "Р": "#c9f2cf",
};

export const ABSENCE_CODES = ["Б", "Н", "ОТ", "ДО", "У"];

export function medicalCodeFor(position: Position) {
  return position === "Офис-менеджер" ? "Б" : "Н";
}

export function visibleMedicalItems<T extends { code: string }>(items: readonly T[], position: Position) {
  const hiddenCode = position === "Офис-менеджер" ? "Н" : "Б";
  return items.filter((item) => item.code !== hiddenCode);
}

/** Строка табеля трудозатрат */
export type EffortRow = {
  id: string;
  projectId: string;
  /** Стадия проекта */
  stage?: string;
  /** Вид работ (свободный текст) */
  workType: string;
  /** день месяца (1..31) -> часы */
  hours: Record<string, number>;
};

/** Сохранённый набор фильтров дашбордов */
export type FilterSet = {
  id: string;
  /** Владелец набора: у каждого пользователя свои наборы */
  ownerId?: string;
  name: string;
  unit: "hours" | "days";
  depts: string[];
  projects: string[];
  people: string[];
  /** Стадии проектов */
  stages?: string[];
  from: string; // YYYY-MM
  to: string; // YYYY-MM
};

/** Действия, доступ к которым настраивается модератором */
export type AccessAction =
  | "viewTimesheet"
  | "editTimesheet"
  | "viewContractors"
  | "editContractors"
  | "createProject"
  | "editProject"
  | "editDepartment"
  | "viewEffort"
  | "editEffort"
  | "viewDashboards"
  | "editEmployeeCard"
  | "deleteEntities"
  | "manageRoles";

export const ACCESS_ACTIONS: { id: AccessAction; label: string }[] = [
  { id: "viewTimesheet", label: "Просмотр табеля рабочего времени" },
  { id: "editTimesheet", label: "Редактирование табеля рабочего времени" },
  { id: "viewContractors", label: "Просмотр табеля подрядчиков" },
  { id: "editContractors", label: "Редактирование табеля подрядчиков" },
  { id: "createProject", label: "Создание проектов" },
  { id: "editProject", label: "Редактирование проектов и табеля проекта" },
  { id: "editDepartment", label: "Редактирование табеля отдела" },
  { id: "viewEffort", label: "Просмотр трудозатрат" },
  { id: "editEffort", label: "Редактирование трудозатрат всех сотрудников" },
  { id: "viewDashboards", label: "Просмотр дашбордов" },
  { id: "editEmployeeCard", label: "Карточка сотрудника: должность, отдел, занятость, даты работы" },
  { id: "deleteEntities", label: "Удаление сотрудников, подрядчиков и проектов" },
  { id: "manageRoles", label: "Управление ролями и доступами" },
];

export type Store = {
  employees: Employee[];
  contractors: Contractor[];
  projects: Project[];
  /** personId -> 'YYYY-MM-DD' -> код или число часов */
  timesheet: Record<string, Record<string, string>>;
  /** personId -> 'YYYY-MM-DD' -> ручное включение/выключение удалёнки «УД» */
  remoteOverride: Record<string, Record<string, boolean>>;

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
  /** Переопределения доступа: должность -> действие -> разрешено */
  access: Partial<Record<Position, Partial<Record<AccessAction, boolean>>>>;
  currentUserId: string;
};


