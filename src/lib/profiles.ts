import type { Employee, Position } from "./types";
import { POSITIONS } from "./types";

export type ProfileRow = {
  id: string;
  username: string;
  last_name: string;
  first_name: string;
  middle_name: string;
  department: string;
  position: string;
  full_time: boolean;
  track_effort: boolean;
  start_work: string | null;
  end_work: string | null;
  comment: string | null;
  hidden: boolean;
  remote_days: number[] | null;
};

export function rowToEmployee(r: ProfileRow): Employee & { login: string } {
  const position = (POSITIONS.includes(r.position as Position) ? r.position : "Сотрудник") as Position;
  return {
    id: r.id,
    login: r.username,
    lastName: r.last_name,
    firstName: r.first_name,
    middleName: r.middle_name ?? "",
    department: r.department ?? "",
    position,
    fullTime: r.full_time,
    trackEffort: r.track_effort,
    birthDate: "",
    remoteDays: r.remote_days ?? [],
    ...(r.start_work ? { startWork: r.start_work } : {}),
    ...(r.end_work ? { endWork: r.end_work } : {}),
    ...(r.comment ? { comment: r.comment } : {}),
    ...(r.hidden ? { hidden: true } : {}),
  };
}

export function employeeToRow(e: Employee) {
  return {
    last_name: e.lastName,
    first_name: e.firstName,
    middle_name: e.middleName ?? "",
    department: e.department ?? "",
    position: e.position,
    full_time: e.fullTime,
    track_effort: e.trackEffort !== false,
    start_work: e.startWork || null,
    end_work: e.endWork || null,
    comment: e.comment ?? null,
    hidden: !!e.hidden,
    remote_days: e.remoteDays ?? [],
  };
}

export function sameEmployee(a: Employee, b: Employee) {
  return JSON.stringify(employeeToRow(a)) === JSON.stringify(employeeToRow(b));
}
