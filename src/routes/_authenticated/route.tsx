import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

// Проверяем вход один раз за загрузку страницы: повторный сетевой запрос
// при каждом переключении вкладки подвешивал навигацию.
let sessionChecked = false;
let checking: Promise<boolean> | null = null;
let subscribed = false;

async function hasSession(): Promise<boolean> {
  if (sessionChecked) return true;
  if (!subscribed) {
    subscribed = true;
    supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") sessionChecked = false;
    });
  }
  if (!checking) {
    checking = (async () => {
      const { data } = await supabase.auth.getSession();
      return Boolean(data.session);
    })().finally(() => {
      checking = null;
    });
  }
  const ok = await checking;
  if (ok) sessionChecked = true;
  return ok;
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    if (!(await hasSession())) throw redirect({ to: "/auth" });
  },
  component: () => <Outlet />,
});
