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
import { POSITIONS, type Position } from "@/lib/types";
import { fio, useStore } from "@/lib/store";

export const Route = createFileRoute("/person/$personId")({
  head: () => ({
    meta: [
      { title: "Карточка человека — АРВ" },
      { name: "description", content: "Данные сотрудника или подрядчика проектного бюро." },
      { property: "og:title", content: "Карточка человека — АРВ" },
      {
        property: "og:description",
        content: "Данные сотрудника или подрядчика проектного бюро.",
      },
    ],
  }),
  component: PersonPage,
});

function PersonPage() {
  const { personId } = Route.useParams();
  const { store, update, can, removeEmployee, removeContractor } = useStore();
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
        <h1 className="text-2xl font-semibold">{fio(person)}</h1>
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

      <div className="mt-4 grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
        {employee ? (
          <>
            <div>
              <Label>Отдел</Label>
              <Input
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
                <SelectTrigger>
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
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Полный рабочий день</SelectItem>
                  <SelectItem value="part">Неполный рабочий день</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Дата рождения (ДД.ММ)</Label>
              <Input
                placeholder="дд.мм"
                value={
                  employee.birthDate
                    ? `${employee.birthDate.slice(8, 10)}.${employee.birthDate.slice(5, 7)}`
                    : ""
                }
                disabled={!cardEditable}
                onChange={(e) => {
                  const m = e.target.value.match(/^(\d{1,2})[.\/-](\d{1,2})$/);
                  if (!m) return;
                  const dd = String(m[1]).padStart(2, "0");
                  const mm = String(m[2]).padStart(2, "0");
                  update((d) => {
                    const x = d.employees.find((z) => z.id === personId);
                    if (x) x.birthDate = `${(x.birthDate || "2000-01-01").slice(0, 4)}-${mm}-${dd}`;
                  });
                }}
              />
            </div>

            <div>
              <Label>Дата начала работы</Label>
              <Input
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
          Изменять эти данные может только офис-менеджер.
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
