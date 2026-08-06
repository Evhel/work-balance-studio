import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PersonLink } from "@/components/PersonLink";
import { byFio, defaultAccess, fio, useStore } from "@/lib/store";
import { ACCESS_ACTIONS, POSITIONS, type Position } from "@/lib/types";

export const Route = createFileRoute("/roles")({
  component: RolesPage,
  head: () => ({
    meta: [
      { title: "Роли и доступы — АРВ" },
      {
        name: "description",
        content:
          "Управление ролями сотрудников и правами просмотра и редактирования табелей в системе учёта трудозатрат АРВ.",
      },
      { property: "og:title", content: "Роли и доступы — АРВ" },
      {
        property: "og:description",
        content: "Настройка должностей и прав доступа к табелям, проектам и дашбордам.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function RolesPage() {
  const { store, update, can, currentUser } = useStore();
  const allowed = can("manageRoles");
  const people = [...store.employees].sort(byFio);

  if (!allowed) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Роли и доступы</h1>
        <p className="mt-4 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          Страница доступна только модератору. Текущий пользователь: {fio(currentUser)} (
          {currentUser.position}).
        </p>
      </div>
    );
  }

  const value = (pos: Position, action: (typeof ACCESS_ACTIONS)[number]["id"]) => {
    const ov = store.access?.[pos]?.[action];
    if (typeof ov === "boolean") return ov;
    return defaultAccess(pos, "", action);
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold">Роли и доступы</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Назначайте должности сотрудникам и настраивайте права просмотра и редактирования табелей.
      </p>

      <h2 className="mt-6 text-sm font-medium">Должности сотрудников</h2>
      <div className="mt-2 overflow-x-auto rounded-lg border bg-card">
        <table className="grid-table w-full">
          <thead>
            <tr className="bg-muted">
              <th className="min-w-[260px] border-r border-b px-3 py-2 text-left text-xs font-medium">
                ФИО
              </th>
              <th className="border-r border-b px-3 py-2 text-left text-xs font-medium">Отдел</th>
              <th className="border-b px-3 py-2 text-left text-xs font-medium">Должность</th>
            </tr>
          </thead>
          <tbody>
            {people.map((e) => (
              <tr key={e.id}>
                <td className="border-r border-b px-3 py-1.5 text-xs">
                  <PersonLink id={e.id} name={fio(e)} />
                </td>
                <td className="border-r border-b px-3 py-1.5 text-xs">{e.department}</td>
                <td className="border-b px-3 py-1.5">
                  <Select
                    value={e.position}
                    onValueChange={(v) =>
                      update((d) => {
                        const x = d.employees.find((z) => z.id === e.id);
                        if (x) x.position = v as Position;
                      })
                    }
                  >
                    <SelectTrigger className="h-8 w-[220px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {POSITIONS.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-sm font-medium">Матрица доступа по должностям</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            update((d) => {
              d.access = {};
            });
            toast.success("Права сброшены к значениям по умолчанию");
          }}
        >
          Сбросить по умолчанию
        </Button>
      </div>

      <div className="mt-2 overflow-x-auto rounded-lg border bg-card">
        <table className="grid-table w-full">
          <thead>
            <tr className="bg-muted">
              <th className="min-w-[320px] border-r border-b px-3 py-2 text-left text-xs font-medium">
                Действие
              </th>
              {POSITIONS.map((p) => (
                <th key={p} className="border-r border-b px-3 py-2 text-xs font-medium">
                  {p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ACCESS_ACTIONS.map((a) => (
              <tr key={a.id}>
                <td className="border-r border-b px-3 py-1.5 text-xs">{a.label}</td>
                {POSITIONS.map((p) => (
                  <td key={p} className="border-r border-b px-3 py-1.5 text-center">
                    <Checkbox
                      checked={value(p, a.id)}
                      onCheckedChange={(v) =>
                        update((d) => {
                          d.access = d.access ?? {};
                          d.access[p] = { ...(d.access[p] ?? {}), [a.id]: !!v };
                        })
                      }
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Для ГИПов права руководителя отдела действуют по умолчанию независимо от матрицы.
      </p>
    </div>
  );
}
