import type { Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import type {
  AccessAction,
  Contractor,
  EffortRow,
  FilterSet,
  Position,
  Project,
  Store,
} from "./types";

export const SHARED_RECORD_KINDS = [
  "project",
  "contractor",
  "timesheet",
  "remote_override",
  "day_override",
  "plan",
  "personal_event",
  "effort_row",
  "effort_done",
  "filter_set",
  "access",
] as const;

export type SharedRecordKind = (typeof SHARED_RECORD_KINDS)[number];

export type SharedRecord = {
  record_kind: SharedRecordKind;
  record_key: string;
  owner_id: string | null;
  payload: Json;
};

type OrderedPayload<T> = { value: T; order: number };

const mapKey = (kind: SharedRecordKind, key: string) => `${kind}\u0000${key}`;
const joinedKey = (...parts: string[]) => parts.join("|");
const splitKey = (key: string, count: number) => {
  const parts = key.split("|");
  return parts.length === count ? parts : null;
};

const asJson = (value: unknown) => value as Json;

function put(
  target: Map<string, SharedRecord>,
  kind: SharedRecordKind,
  key: string,
  payload: unknown,
  ownerId: string | null = null,
) {
  const row: SharedRecord = {
    record_kind: kind,
    record_key: key,
    owner_id: ownerId,
    payload: asJson(payload),
  };
  target.set(mapKey(kind, key), row);
}

export function sharedRecordsFromStore(store: Store, authUserId: string) {
  const rows = new Map<string, SharedRecord>();

  store.projects.forEach((value, order) =>
    put(rows, "project", value.id, { value, order } satisfies OrderedPayload<Project>),
  );
  store.contractors.forEach((value, order) =>
    put(rows, "contractor", value.id, { value, order } satisfies OrderedPayload<Contractor>),
  );

  for (const [personId, dates] of Object.entries(store.timesheet)) {
    for (const [date, value] of Object.entries(dates)) {
      put(rows, "timesheet", joinedKey(personId, date), value);
    }
  }
  for (const [personId, dates] of Object.entries(store.remoteOverride)) {
    for (const [date, value] of Object.entries(dates)) {
      put(rows, "remote_override", joinedKey(personId, date), value);
    }
  }
  for (const [date, value] of Object.entries(store.dayOverrides)) {
    put(rows, "day_override", date, value);
  }
  for (const [projectId, people] of Object.entries(store.plan)) {
    for (const [personId, dates] of Object.entries(people)) {
      for (const [date, value] of Object.entries(dates)) {
        put(rows, "plan", joinedKey(projectId, personId, date), value);
      }
    }
  }
  for (const [personId, dates] of Object.entries(store.personalEvents)) {
    for (const [date, value] of Object.entries(dates)) {
      put(rows, "personal_event", joinedKey(personId, date), value);
    }
  }
  for (const [personId, months] of Object.entries(store.effort)) {
    for (const [month, effortRows] of Object.entries(months)) {
      effortRows.forEach((value, order) =>
        put(
          rows,
          "effort_row",
          joinedKey(personId, month, value.id),
          { value, order } satisfies OrderedPayload<EffortRow>,
          personId,
        ),
      );
    }
  }
  for (const [personId, months] of Object.entries(store.effortDone)) {
    for (const [month, value] of Object.entries(months)) {
      put(rows, "effort_done", joinedKey(personId, month), value, personId);
    }
  }
  store.filterSets.forEach((value, order) => {
    const ownerId = value.ownerId || authUserId;
    put(rows, "filter_set", value.id, { value: { ...value, ownerId }, order }, ownerId);
  });
  for (const [position, actions] of Object.entries(store.access)) {
    for (const [action, value] of Object.entries(actions ?? {})) {
      if (typeof value === "boolean") {
        put(rows, "access", joinedKey(position, action), value);
      }
    }
  }

  return rows;
}

export function emptySharedStore(currentUserId = ""): Store {
  return {
    employees: [],
    contractors: [],
    projects: [],
    timesheet: {},
    remoteOverride: {},
    dayOverrides: {},
    plan: {},
    personalEvents: {},
    effort: {},
    effortDone: {},
    filterSets: [],
    access: {},
    currentUserId,
  };
}

function orderedValue<T>(payload: Json): OrderedPayload<T> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const candidate = payload as { value?: unknown; order?: unknown };
  if (!("value" in candidate) || typeof candidate.order !== "number") return null;
  return candidate as OrderedPayload<T>;
}

export function sharedStoreFromRecords(rows: SharedRecord[], currentUserId: string): Store {
  const store = emptySharedStore(currentUserId);
  const projects: OrderedPayload<Project>[] = [];
  const contractors: OrderedPayload<Contractor>[] = [];
  const filterSets: OrderedPayload<FilterSet>[] = [];
  const efforts = new Map<string, OrderedPayload<EffortRow>[]>();

  for (const row of rows) {
    switch (row.record_kind) {
      case "project": {
        const value = orderedValue<Project>(row.payload);
        if (value) projects.push(value);
        break;
      }
      case "contractor": {
        const value = orderedValue<Contractor>(row.payload);
        if (value) contractors.push(value);
        break;
      }
      case "timesheet": {
        const key = splitKey(row.record_key, 2);
        if (!key || typeof row.payload !== "string") break;
        store.timesheet[key[0]!] ??= {};
        store.timesheet[key[0]!]![key[1]!] = row.payload;
        break;
      }
      case "remote_override": {
        const key = splitKey(row.record_key, 2);
        if (!key || typeof row.payload !== "boolean") break;
        store.remoteOverride[key[0]!] ??= {};
        store.remoteOverride[key[0]!]![key[1]!] = row.payload;
        break;
      }
      case "day_override":
        if (row.payload === "work" || row.payload === "off") {
          store.dayOverrides[row.record_key] = row.payload;
        }
        break;
      case "plan": {
        const key = splitKey(row.record_key, 3);
        if (!key || typeof row.payload !== "string") break;
        store.plan[key[0]!] ??= {};
        store.plan[key[0]!]![key[1]!] ??= {};
        store.plan[key[0]!]![key[1]!]![key[2]!] = row.payload;
        break;
      }
      case "personal_event": {
        const key = splitKey(row.record_key, 2);
        if (!key || typeof row.payload !== "string") break;
        store.personalEvents[key[0]!] ??= {};
        store.personalEvents[key[0]!]![key[1]!] = row.payload;
        break;
      }
      case "effort_row": {
        const key = splitKey(row.record_key, 3);
        const value = orderedValue<EffortRow>(row.payload);
        if (!key || !value) break;
        const group = joinedKey(key[0]!, key[1]!);
        const list = efforts.get(group) ?? [];
        list.push(value);
        efforts.set(group, list);
        break;
      }
      case "effort_done": {
        const key = splitKey(row.record_key, 2);
        if (!key || typeof row.payload !== "boolean") break;
        store.effortDone[key[0]!] ??= {};
        store.effortDone[key[0]!]![key[1]!] = row.payload;
        break;
      }
      case "filter_set": {
        const value = orderedValue<FilterSet>(row.payload);
        if (value) filterSets.push(value);
        break;
      }
      case "access": {
        const key = splitKey(row.record_key, 2);
        if (!key || typeof row.payload !== "boolean") break;
        const position = key[0] as Position;
        const action = key[1] as AccessAction;
        store.access[position] ??= {};
        store.access[position]![action] = row.payload;
        break;
      }
    }
  }

  store.projects = projects.sort((a, b) => a.order - b.order).map((item) => item.value);
  store.contractors = contractors.sort((a, b) => a.order - b.order).map((item) => item.value);
  store.filterSets = filterSets.sort((a, b) => a.order - b.order).map((item) => item.value);
  for (const [key, list] of efforts) {
    const parts = splitKey(key, 2);
    if (!parts) continue;
    store.effort[parts[0]!] ??= {};
    store.effort[parts[0]!]![parts[1]!] = list
      .sort((a, b) => a.order - b.order)
      .map((item) => item.value);
  }

  return store;
}

export async function loadSharedRecords() {
  const { data, error } = await supabase
    .from("app_records")
    .select("record_kind,record_key,owner_id,payload");
  if (error) throw error;
  return (data ?? []) as SharedRecord[];
}

function sameRecord(a: SharedRecord, b: SharedRecord) {
  return a.owner_id === b.owner_id && JSON.stringify(a.payload) === JSON.stringify(b.payload);
}

export async function persistSharedChanges(
  before: Map<string, SharedRecord>,
  after: Map<string, SharedRecord>,
) {
  const upserts: SharedRecord[] = [];
  const deletions = new Map<SharedRecordKind, string[]>();

  for (const [key, row] of after) {
    const previous = before.get(key);
    if (!previous || !sameRecord(previous, row)) upserts.push(row);
  }
  for (const row of before.values()) {
    if (after.has(mapKey(row.record_kind, row.record_key))) continue;
    const keys = deletions.get(row.record_kind) ?? [];
    keys.push(row.record_key);
    deletions.set(row.record_kind, keys);
  }

  if (upserts.length) {
    const { error } = await supabase.from("app_records").upsert(upserts, {
      onConflict: "record_kind,record_key",
    });
    if (error) throw error;
  }

  for (const [kind, keys] of deletions) {
    const { error } = await supabase
      .from("app_records")
      .delete()
      .eq("record_kind", kind)
      .in("record_key", keys);
    if (error) throw error;
  }
}
