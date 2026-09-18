import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { POSITIONS, type Position } from "./types";

/** Логин превращается в служебный адрес: почту сотрудники не вводят */
export function loginToEmail(login: string) {
  return `${login.trim().toLowerCase()}@arv.local`;
}

const ROLE_BY_POSITION: Record<Position, string> = {
  "Директор": "director",
  "Модератор": "moderator",
  "Руководитель отдела": "head",
  "Сотрудник": "employee",
  "Офис-менеджер": "office_manager",
};

const loginSchema = z
  .string()
  .trim()
  .min(3, "Логин не короче 3 символов")
  .max(40)
  .regex(/^[a-zA-Z0-9._-]+$/, "Логин: латиница, цифры, точка, дефис, подчёркивание");

const registerSchema = z.object({
  login: loginSchema,
  password: z.string().min(6, "Пароль не короче 6 символов").max(72),
  lastName: z.string().trim().min(1, "Укажите фамилию").max(60),
  firstName: z.string().trim().min(1, "Укажите имя").max(60),
  department: z.string().trim().max(60).default(""),
  position: z.enum(POSITIONS as [Position, ...Position[]]),
  fullTime: z.boolean().default(true),
});

type RegisterInput = z.infer<typeof registerSchema>;

async function createAccount(input: RegisterInput) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const email = loginToEmail(input.login);

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { login: input.login },
  });
  if (createError || !created.user) {
    throw new Error(
      createError?.message?.includes("already")
        ? "Такой логин уже занят"
        : (createError?.message ?? "Не удалось создать учётную запись"),
    );
  }

  const userId = created.user.id;
  const { error: profileError } = await supabaseAdmin.from("profiles").insert({
    id: userId,
    username: input.login.toLowerCase(),
    last_name: input.lastName,
    first_name: input.firstName,
    department: input.department,
    position: input.position,
    full_time: input.fullTime,
  });
  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(userId);
    throw new Error(
      profileError.message.includes("duplicate")
        ? "Такой логин уже занят"
        : profileError.message,
    );
  }

  await supabaseAdmin
    .from("user_roles")
    .insert({ user_id: userId, role: ROLE_BY_POSITION[input.position] as never });

  return { userId };
}

/** Есть ли вообще учётные записи (для первичной настройки) */
export const hasAnyUser = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count } = await supabaseAdmin
    .from("profiles")
    .select("id", { count: "exact", head: true });
  return { exists: (count ?? 0) > 0 };
});

/** Первая учётная запись модератора — доступна только пока сотрудников нет */
export const createFirstModerator = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    registerSchema
      .omit({ position: true })
      .extend({ position: z.literal("Модератор").default("Модератор") })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true });
    if ((count ?? 0) > 0) throw new Error("Учётные записи уже созданы");
    await createAccount({ ...data, position: "Модератор" });
    return { ok: true as const };
  });

async function assertAdmin(supabase: {
  from: (t: "user_roles") => {
    select: (c: string) => { eq: (k: string, v: string) => Promise<{ data: { role: string }[] | null }> };
  };
}, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r) => r.role);
  if (!roles.includes("moderator") && !roles.includes("office_manager")) {
    throw new Error("Регистрировать сотрудников может модератор или офис-менеджер");
  }
}

/** Регистрация сотрудника модератором или офис-менеджером */
export const registerEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => registerSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    await createAccount(data);
    return { ok: true as const };
  });

/** Смена пароля сотрудника модератором или офис-менеджером */
export const setEmployeePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ userId: z.string().uuid(), password: z.string().min(6).max(72) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Удаление учётной записи сотрудника */
export const deleteEmployeeAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Синхронизация роли доступа с должностью сотрудника */
export const setEmployeeRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ userId: z.string().uuid(), position: z.enum(POSITIONS as [Position, ...Position[]]) })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: ROLE_BY_POSITION[data.position] as never });
    return { ok: true as const };
  });
