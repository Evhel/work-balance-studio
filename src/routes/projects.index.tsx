import { Link, createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MONTHS_SHORT, daysInMonth, pad } from "@/lib/dates";
import { projectColor, useStore } from "@/lib/store";
import { contrastText } from "@/lib/colors";
import type { Project } from "@/lib/types";

export const Route = createFileRoute("/projects/")({
  head: () => ({
    meta: [
      { title: "Проекты — АРВ" },
      { name: "description", content: "Годовой календарь проектов бюро и карточки проектов." },
      { property: "og:title", content: "Проекты — АРВ" },
      {
        property: "og:description",
        content: "Годовой календарь проектов бюро и карточки проектов.",
      },
    ],
  }),
  component: ProjectsPage,
});

function monthIndex(dateIso: string, year: number) {
  const [y, m] = dateIso.split("-").map(Number);
  if (y! < year) return -1;
  if (y! > year) return 12;
  return m! - 1;
}

type Status = "done" | "current" | "paused" | "future";

function status(p: Project): Status {
  if (p.paused) return "paused";
  const today = new Date().toISOString().slice(0, 10);
  if (p.start > today) return "future";
  if (p.end < today) return "done";
  return "current";
}

const COLUMNS: { key: Status; title: string; bg: string }[] = [
  { key: "done", title: "Завершён", bg: "#ececec" },
  { key: "current", title: "Текущий", bg: "#e3f6e6" },
  { key: "paused", title: "На паузе", bg: "#fdf3c8" },
  { key: "future", title: "Будущий", bg: "#e6efff" },
];


function ProjectsPage() {
  const { store, update, can } = useStore();
  const [year, setYear] = useState(new Date().getFullYear());
  const gridRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; edge: "start" | "end" } | null>(null);
  const editable = can("createProject");

  const monthFromEvent = (e: React.MouseEvent) => {
    const el = gridRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    return Math.min(11, Math.max(0, Math.floor((x / rect.width) * 12)));
  };

  const onMove = (e: React.MouseEvent) => {
    if (!drag) return;
    const m = monthFromEvent(e);
    update((d) => {
      const p = d.projects.find((x) => x.id === drag.id);
      if (!p) return;
      if (drag.edge === "start") {
        const candidate = `${year}-${pad(m + 1)}-01`;
        if (candidate <= p.end) p.start = candidate;
      } else {
        const candidate = `${year}-${pad(m + 1)}-${pad(daysInMonth(year, m))}`;
        if (candidate >= p.start) p.end = candidate;
      }
    });
  };

  const addProject = () => {
    const name = window.prompt("Название нового проекта");
    if (!name) return;
    const m = new Date().getMonth();
    update((d) =>
      d.projects.push({
        id: `p${Date.now()}`,
        name,
        color: projectColor(d.projects.length),
        stages: ["ОТР"],
        start: `${year}-${pad(m + 1)}-01`,
        end: `${year}-${pad(Math.min(12, m + 3))}-${pad(daysInMonth(year, Math.min(11, m + 2)))}`,
        description: "",
        members: [],
      }),
    );
    toast.success("Проект создан");
  };

  /** Служебный проект «Без объекта» на этой вкладке не показываем */
  const listed = store.projects.filter((p) => p.name !== "Без объекта");

  const visible = listed.filter(
    (p) => monthIndex(p.start, year) < 12 && monthIndex(p.end, year) >= 0,
  );

  const todayIso = new Date().toISOString().slice(0, 10);
  const horizon = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 2);
    return d.toISOString().slice(0, 10);
  })();
  const upcomingGoals = listed
    .flatMap((p) =>
      (p.goals ?? [])
        .filter((g) => g.date >= todayIso && g.date <= horizon)
        .map((g) => ({
          key: `${p.id}_${g.id}`,
          date: g.date,
          name: g.name,
          projectId: p.id,
          projectName: p.name,
          color: p.color,
        })),
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div>
      <h1 className="text-2xl font-semibold">Проекты</h1>


      <div className="mt-3 flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => setYear(year - 1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="w-16 text-center font-medium">{year}</span>
        <Button variant="outline" size="icon" onClick={() => setYear(year + 1)}>
          <ChevronRight className="size-4" />
        </Button>
        {editable && (
          <Button className="ml-4" onClick={addProject}>
            <Plus className="size-4" /> Добавить новый проект
          </Button>
        )}
      </div>

      <div
        className="mt-4 overflow-hidden rounded-lg border bg-card"
        onMouseMove={onMove}
        onMouseUp={() => setDrag(null)}
        onMouseLeave={() => setDrag(null)}
      >
        <div className="grid grid-cols-12 border-b bg-muted text-center text-xs font-medium">
          {MONTHS_SHORT.map((m) => (
            <div key={m} className="border-r py-2 last:border-r-0">
              {m}
            </div>
          ))}
        </div>
        <div ref={gridRef} className="relative">
          <div className="pointer-events-none absolute inset-0 grid grid-cols-12">
            {MONTHS_SHORT.map((m) => (
              <div key={m} className="border-r last:border-r-0" />
            ))}
          </div>
          <div className="relative space-y-1 py-2">
            {visible.map((p) => {
              const s = Math.max(0, monthIndex(p.start, year));
              const e = Math.min(11, monthIndex(p.end, year));
              return (
                <div key={p.id} className="grid grid-cols-12 px-0">
                  <div
                    className="group relative mx-0.5 flex h-8 items-center rounded-md px-2 text-xs"
                    style={{
                      gridColumn: `${s + 1} / ${e + 2}`,
                      background: p.color,
                      color: contrastText(p.color),
                    }}
                  >
                    <span
                      className="absolute left-0 top-0 h-full w-2 cursor-ew-resize rounded-l-md bg-black/25 opacity-0 group-hover:opacity-100"
                      onMouseDown={() => editable && setDrag({ id: p.id, edge: "start" })}
                    />
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: p.id }}
                      className="truncate font-medium"
                    >
                      {p.name}
                    </Link>
                    <span
                      className="absolute right-0 top-0 h-full w-2 cursor-ew-resize rounded-r-md bg-black/25 opacity-0 group-hover:opacity-100"
                      onMouseDown={() => editable && setDrag({ id: p.id, edge: "end" })}
                    />
                  </div>
                </div>
              );
            })}
            {visible.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                В этом году проектов нет
              </div>
            )}
          </div>
        </div>
      </div>
      {editable && (
        <p className="mt-2 text-xs text-muted-foreground">
          Потяните за края полосы проекта, чтобы изменить дату начала или окончания.
        </p>
      )}

      <h2 className="mt-8 text-lg font-medium">Список проектов</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const list = listed.filter((p) => status(p) === col.key);
          return (
            <div key={col.key} className="rounded-lg border bg-card p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <span className="size-3 rounded-sm" style={{ background: col.bg }} />
                {col.title}
                <span className="text-xs text-muted-foreground">({list.length})</span>
              </div>
              <div className="space-y-2">
                {list.map((p) => (
                  <div key={p.id} className="rounded-md border p-2" style={{ background: col.bg }}>
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: p.id }}
                      className="flex items-center gap-2"
                    >
                      <span className="size-3 shrink-0 rounded-full" style={{ background: p.color }} />
                      <span className="truncate text-sm font-medium">{p.name}</span>
                    </Link>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {(p.stages ?? []).join(", ") || "—"} · {p.start} — {p.end}
                    </div>
                    {editable && (
                      <button
                        className="mt-1 text-xs text-primary underline"
                        onClick={() =>
                          update((d) => {
                            const t = d.projects.find((x) => x.id === p.id);
                            if (t) t.paused = !t.paused;
                          })
                        }
                      >
                        {p.paused ? "Снять паузу" : "Поставить на паузу"}
                      </button>
                    )}
                  </div>
                ))}
                {list.length === 0 && <p className="text-xs text-muted-foreground">Пусто</p>}
              </div>
            </div>
          );
        })}
      </div>

      <h2 className="mt-8 text-lg font-medium">Цели на ближайшие два месяца</h2>
      <div className="mt-3 overflow-hidden rounded-lg border bg-card">
        {upcomingGoals.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">Целей нет</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {upcomingGoals.map((g) => (
                <tr key={g.key} className="border-b last:border-b-0">
                  <td className="w-28 px-3 py-2 text-xs text-muted-foreground">{g.date}</td>
                  <td className="w-64 px-3 py-2">
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: g.projectId }}
                      className="flex items-center gap-2"
                    >
                      <span
                        className="size-3 shrink-0 rounded-full"
                        style={{ background: g.color }}
                      />
                      <span className="truncate text-xs font-medium">{g.projectName}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs">{g.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
