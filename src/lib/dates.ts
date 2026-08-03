export const MONTHS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

export const MONTHS_SHORT = [
  "Янв",
  "Фев",
  "Мар",
  "Апр",
  "Май",
  "Июн",
  "Июл",
  "Авг",
  "Сен",
  "Окт",
  "Ноя",
  "Дек",
];

export const WEEKDAYS_SHORT = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

export function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function iso(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

export function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

/** 0 = понедельник */
export function weekdayIndex(year: number, month: number, day: number) {
  return (new Date(year, month, day).getDay() + 6) % 7;
}

export function isWeekendDate(year: number, month: number, day: number) {
  return weekdayIndex(year, month, day) >= 5;
}

export function todayIso() {
  const d = new Date();
  return iso(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Список доступных месяцев: весь 2025 год + до года вперёд от сегодня */
export function availableMonths(): { year: number; month: number }[] {
  const now = new Date();
  const list: { year: number; month: number }[] = [];
  const start = new Date(2025, 0, 1);
  const end = new Date(now.getFullYear() + 1, now.getMonth(), 1);
  const cur = new Date(start);
  while (cur <= end) {
    list.push({ year: cur.getFullYear(), month: cur.getMonth() });
    cur.setMonth(cur.getMonth() + 1);
  }
  return list;
}

export function monthKey(year: number, month: number) {
  return year * 12 + month;
}

export function clampMonth(year: number, month: number) {
  const list = availableMonths();
  const first = list[0]!;
  const last = list[list.length - 1]!;
  const k = monthKey(year, month);
  if (k < monthKey(first.year, first.month)) return first;
  if (k > monthKey(last.year, last.month)) return last;
  return { year, month };
}

export function shiftMonth(year: number, month: number, delta: number) {
  const d = new Date(year, month + delta, 1);
  return clampMonth(d.getFullYear(), d.getMonth());
}
