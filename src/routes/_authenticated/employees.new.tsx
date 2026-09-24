import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
import { Check, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { registerEmployee } from "@/lib/auth.functions";
import { useStore } from "@/lib/store";
import { POSITIONS, type Position } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/employees/new")({
  component: NewEmployeePage,
  head: () => ({
    meta: [
      { title: "Новый сотрудник — ARV. Трудозатраты" },
      {
        name: "description",
        content: "Создание учётной записи нового сотрудника в системе ARV.",
      },
      { property: "og:title", content: "Новый сотрудник — ARV. Трудозатраты" },
      {
        property: "og:description",
        content: "Регистрация сотрудников для работы в системе учёта трудозатрат ARV.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const initialForm = {
  lastName: "",
  firstName: "",
  department: "",
  position: "Сотрудник" as Position,
  fullTime: true,
  login: "",
  password: "",
};

function NewEmployeePage() {
  const { store, currentUser, reloadEmployees } = useStore();
  const [form, setForm] = useState(initialForm);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(false);
  const allowed =
    currentUser.position === "Модератор" || currentUser.position === "Офис-менеджер";
  const departments = useMemo(
    () => Array.from(new Set(store.employees.map((employee) => employee.department))).filter(Boolean).sort(),
    [store.employees],
  );

  if (!allowed) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Новый сотрудник</h1>
        <p className="mt-4 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          Страница доступна только модератору и офис-менеджеру.
        </p>
      </div>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setCreated(false);
    try {
      await registerEmployee({ data: form });
      await reloadEmployees();
      setForm(initialForm);
      setCreated(true);
      toast.success("Сотрудник зарегистрирован");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось зарегистрировать сотрудника");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Новый сотрудник</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Создайте учётную запись и задайте основные данные сотрудника.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/roles">Роли и доступы</Link>
        </Button>
      </div>

      <form onSubmit={submit} className="mt-6 rounded-lg border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="last-name">Фамилия</Label>
            <Input
              id="last-name"
              className="mt-1"
              value={form.lastName}
              onChange={(event) => setForm({ ...form, lastName: event.target.value })}
              required
            />
          </div>
          <div>
            <Label htmlFor="first-name">Имя</Label>
            <Input
              id="first-name"
              className="mt-1"
              value={form.firstName}
              onChange={(event) => setForm({ ...form, firstName: event.target.value })}
              required
            />
          </div>
          <div>
            <Label htmlFor="department">Отдел</Label>
            <Input
              id="department"
              className="mt-1"
              list="employee-departments"
              value={form.department}
              onChange={(event) => setForm({ ...form, department: event.target.value })}
            />
            <datalist id="employee-departments">
              {departments.map((department) => (
                <option key={department} value={department} />
              ))}
            </datalist>
          </div>
          <div>
            <Label>Должность</Label>
            <Select
              value={form.position}
              onValueChange={(position) => setForm({ ...form, position: position as Position })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POSITIONS.map((position) => (
                  <SelectItem key={position} value={position}>
                    {position}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="login">Логин</Label>
            <Input
              id="login"
              className="mt-1"
              autoComplete="off"
              pattern="[a-zA-Z0-9._-]{3,40}"
              title="От 3 символов: латиница, цифры, точка, дефис или подчёркивание"
              value={form.login}
              onChange={(event) => setForm({ ...form, login: event.target.value })}
              required
            />
          </div>
          <div>
            <Label htmlFor="password">Пароль</Label>
            <Input
              id="password"
              className="mt-1"
              type="password"
              autoComplete="new-password"
              minLength={6}
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              required
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-md border px-3 py-2.5">
          <Switch
            id="full-time"
            checked={form.fullTime}
            onCheckedChange={(fullTime) => setForm({ ...form, fullTime })}
          />
          <Label htmlFor="full-time">
            {form.fullTime ? "Полный рабочий день" : "Неполный рабочий день"}
          </Label>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy}>
            <UserPlus className="size-4" />
            {busy ? "Создание…" : "Создать сотрудника"}
          </Button>
          {created && (
            <span className="flex items-center gap-1.5 text-sm text-primary">
              <Check className="size-4" /> Учётная запись создана
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
