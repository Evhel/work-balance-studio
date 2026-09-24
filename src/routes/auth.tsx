import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createFirstModerator, hasAnyUser, loginToEmail } from "@/lib/auth.functions";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Вход — ARV. Трудозатраты" },
      { name: "description", content: "Вход в систему учёта трудозатрат проектного бюро ARV." },
      { property: "og:title", content: "Вход — ARV. Трудозатраты" },
      {
        property: "og:description",
        content: "Доступ к табелям, проектам и дашбордам бюро только для сотрудников.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "setup" | "loading">("loading");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        void navigate({ to: "/effort", replace: true });
        return;
      }
      try {
        const res = await hasAnyUser();
        setMode(res.exists ? "login" : "setup");
      } catch {
        setMode("login");
      }
    })();
  }, [navigate]);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: loginToEmail(login),
      password,
    });
    setBusy(false);
    if (err) {
      setError("Неверный логин или пароль");
      return;
    }
    void navigate({ to: "/effort", replace: true });
  }

  async function onSetup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await createFirstModerator({
        data: { login, password, lastName, firstName, department: "", fullTime: true },
      });
      const { error: err } = await supabase.auth.signInWithPassword({
        email: loginToEmail(login),
        password,
      });
      if (err) throw new Error("Учётная запись создана, войдите вручную");
      void navigate({ to: "/effort", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать учётную запись");
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary";

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <div className="text-xl font-bold text-foreground">ARV. Трудозатраты</div>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "setup"
            ? "Создайте первую учётную запись модератора"
            : "Вход по логину и паролю"}
        </p>

        {mode === "loading" ? (
          <p className="mt-6 text-sm text-muted-foreground">Загрузка…</p>
        ) : (
          <form className="mt-5 space-y-3" onSubmit={mode === "setup" ? onSetup : onLogin}>
            {mode === "setup" && (
              <div className="grid grid-cols-2 gap-2">
                <input
                  className={input}
                  placeholder="Фамилия"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
                <input
                  className={input}
                  placeholder="Имя"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
            )}
            <input
              className={input}
              placeholder="Логин"
              autoComplete="username"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              required
            />
            <input
              className={input}
              type="password"
              placeholder="Пароль"
              autoComplete={mode === "setup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {mode === "setup" ? "Создать и войти" : "Войти"}
            </button>
            {mode === "login" && (
              <p className="pt-1 text-center text-xs text-muted-foreground">
                Учётные записи создают модератор и офис-менеджер.
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
