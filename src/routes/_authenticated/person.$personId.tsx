import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PersonCalendar } from "@/components/PersonCalendar";
import { POSITIONS, type Position } from "@/lib/types";
import { fio, useStore } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/person/$personId")({
  head: () => ({
    meta: [
      { title: "Сотрудник — ARV. Трудозатраты" },
      { name: "description", content: "Данные сотрудника проектного бюро." },
      { property: "og:title", content: "Сотрудник — ARV. Трудозатраты" },
      {
        property: "og:description",
        content: "Данные сотрудника проектного бюро.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PersonPage,
});

function PersonPage() {
  const { personId } = Route.useParams();
  const { store, update, can, currentUser, removeEmployee, removeContractor } = useStore();
  const navigate = useNavigate();
  const employee = store.employees.find((e) => e.id === personId);
  const contractor = store.contractors.find((c) => c.id === personId);
  const canDelete = can("deleteEntities");

  if (!employee && !contractor) {
    return (
      <div>
        <p className="text-sm text-muted-foreground">Человек не найден.</p>
        <Link to="/" className="text-primary underline">
          На главную
        </Link>
      </div>
    );
  }

  const editable = employee ? can("editDepartment") : can("editContractors");
  const cardEditable = can("editEmployeeCard");
  const nameEditable =
    currentUser.position === "Модератор" || currentUser.position === "Офис-менеджер";
  const person = employee ?? contractor!;
  const comment = person.comment ?? "";

  const setComment = (v: string) =>
    update((d) => {
      const target = employee
        ? d.employees.find((x) => x.id === personId)
        : d.contractors.find((x) => x.id === personId);
      if (target) target.comment = v;
    });

  const projects = store.projects.filter((p) =>
    p.members.some((m) => m.personId === personId),
  );

  return (
    <div>
      <Link
        to={employee ? "/" : "/contractors"}
        className="mb-3 inline-flex items-center gap-2 text-lg font-medium text-primary"
      >
        <ArrowLeft className="size-5" /> Назад
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Сотрудник</p>
          <h1 className="text-2xl font-semibold">{fio(person)}</h1>
        </div>
        {canDelete && (
          <Button
            variant="destructive"
            onClick={() => {
              if (!window.confirm(`Удалить ${fio(person)} из системы?`)) return;
              if (employee) removeEmployee(personId);
              else removeContractor(personId);
              toast.success("Удалено");
              navigate({ to: employee ? "/" : "/contractors" });
            }}
          >
            <Trash2 className="size-4" /> Удалить из системы
          </Button>
        )}
      </div>

      <div className="mt-4 grid gap-x-3 gap-y-2 rounded-lg border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4">
        {employee ? (
          <>
            <div>
              <Label>Фамилия</Label>
              <Input
                className="h-8"
                value={employee.lastName}
                disabled={!nameEditable}
                onChange={(e) =>
                  update((d) => {
                    const x = d.employees.find((z) => z.id === personId);
                    if (x) x.lastName = e.target.value;
                  })
                }
              />
            </div>
            <div>
              <Label>Имя</Label>
              <Input
                className="h-8"
                value={employee.firstName}
                disabled={!nameEditable}
                onChange={(e) =>
                  update((d) => {
                    const x = d.employees.find((z) => z.id === personId);
                    if (x) x.firstName = e.target.value;
                  })
                }
              />
            </div>
            <div>
              <Label>Отдел</Label>
              <Input
                className="h-8"
                value={employee.department}
                disabled={!cardEditable}
                onChange={(e) =>
                  update((d) => {
                    const x = d.employees.find((z) => z.id === personId);
                    if (x) x.department = e.target.value;
                  })
                }
              />
            </div>
            <div>
              <Label>Должность</Label>
              <Select
                value={employee.position}
                disabled={!cardEditable}
                onValueChange={(v) =>
                  update((d) => {
                    const x = d.employees.find((z) => z.id === personId);
                    if (x) x.position = v as Position;
                  })
                }
              >
                <SelectTrigger className="h-8">
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
            </div>
            <div>
              <Label>Занятость</Label>
              <Select
                value={employee.fullTime ? "full" : "part"}
                disabled={!cardEditable}
                onValueChange={(v) =>
                  update((d) => {
                    const x = d.employees.find((z) => z.id === personId);
                    if (x) x.fullTime = v === "full";
                  })
                }
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Полный рабочий день</SelectItem>
                  <SelectItem value="part">Неполный рабочий день</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Дата начала работы</Label>
              <Input
                className="h-8"
                type="date"
                value={employee.startWork ?? ""}
                disabled={!cardEditable}
                onChange={(e) =>
                  update((d) => {
                    const x = d.employees.find((z) => z.id === personId);
                    if (x) x.startWork = e.target.value;
                  })
                }
              />
            </div>
            <div>
              <Label>Дата конца работы</Label>
              <Input
                className="h-8"
                type="date"
                value={employee.endWork ?? ""}
                disabled={!cardEditable}
                onChange={(e) =>
                  update((d) => {
                    const x = d.employees.find((z) => z.id === personId);
                    if (x) x.endWork = e.target.value;
                  })
                }
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <div className="text-xs font-medium">Рег. удалёнка</div>
                  <p className="text-[11px] text-muted-foreground">Автоматическая отметка «УД»</p>
                </div>
                <div className="flex gap-1">
                  {["Пн", "Вт", "Ср", "Чт", "Пт"].map((w, i) => {
                    const day = i + 1;
                    const on = employee.remoteDays?.includes(day) ?? false;
                    return (
                      <Button
                        key={w}
                        type="button"
                        variant={on ? "default" : "outline"}
                        size="sm"
                        disabled={!cardEditable}
                        className="size-8 px-0"
                        onClick={() =>
                          update((d) => {
                            const x = d.employees.find((z) => z.id === personId);
                            if (!x) return;
                            const cur = new Set(x.remoteDays ?? []);
                            if (cur.has(day)) cur.delete(day);
                            else cur.add(day);
                            x.remoteDays = [...cur].sort((a, b) => a - b);
                          })
                        }
                      >
                        {w}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <Field label="Отдел" value={person.department} />
            <Field
              label="Проект"
              value={store.projects.find((p) => p.id === contractor!.projectId)?.name ?? "—"}
            />
          </>
        )}
      </div>
      {employee && !cardEditable && (
        <p className="mt-2 text-xs text-muted-foreground">
          Профиль редактирует офис-менеджер; фамилию и имя также может изменить модератор.
        </p>
      )}

      <div className="mt-4 rounded-lg border bg-card p-4">
        <div className="mb-2 text-sm font-medium">Проекты</div>
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">Не участвует в проектах</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {projects.map((p) => (
              <Link
                key={p.id}
                to="/projects/$projectId"
                params={{ projectId: p.id }}
                className="flex items-center gap-2 rounded-md border px-3 py-1 text-sm hover:bg-accent"
              >
                <span className="size-3 rounded-full" style={{ background: p.color }} />
                {p.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4">
        <Label>Комментарий</Label>
        <Textarea
          className="mt-1 min-h-32"
          value={comment}
          disabled={!editable}
          placeholder="Свободный комментарий…"
          onChange={(e) => setComment(e.target.value)}
        />
      </div>

      {employee && (
        <div className="mt-8 border-t pt-6">
          <PersonCalendar personId={employee.id} />
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <p className="mt-1 text-sm">{value}</p>
    </div>
  );
}
