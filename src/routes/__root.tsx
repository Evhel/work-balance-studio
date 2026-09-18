import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { StoreProvider, useStore } from "../lib/store";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ARV. Трудозатораты" },
      {
        name: "description",
        content:
          "Табели рабочего времени, подрядчики, проекты и загрузка отделов проектного бюро.",
      },
      { property: "og:title", content: "ARV. Трудозатораты" },
      {
        property: "og:description",
        content: "Планирование загрузки сотрудников и подрядчиков проектного бюро.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

const TABS = [
  { to: "/", label: "Табель рабочего времени", officeOnly: true },
  { to: "/effort", label: "Трудозатраты" },
  { to: "/dashboards", label: "Дашборды" },
  { to: "/projects", label: "Проекты" },
  { to: "/department", label: "Отдел" },
  { to: "/contractors", label: "Табель подрядчиков" },
  { to: "/roles", label: "Роли и доступы" },
  { to: "/instruction", label: "Инструкция" },
] as const;

function CurrentUserBadge() {
  const { currentUser, signOut } = useStore();
  const router = useRouter();
  return (
    <div className="flex items-center gap-3 text-xs text-primary-foreground/80">
      <span>
        {currentUser.lastName} {currentUser.firstName} — {currentUser.position}
      </span>
      <button
        type="button"
        className="rounded-md border border-primary-foreground/30 bg-primary-foreground/10 px-2 py-1 text-primary-foreground transition-colors hover:bg-primary-foreground/20"
        onClick={async () => {
          await signOut();
          await router.navigate({ to: "/auth", replace: true });
        }}
      >
        Выйти
      </button>
    </div>
  );
}

function Chrome() {
  const { can } = useStore();
  const tabs = TABS.filter((t) => !("officeOnly" in t && t.officeOnly) || can("editTimesheet"));
  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="text-2xl font-bold tracking-wide text-primary-foreground sm:text-3xl">
            ARV. Трудозатораты
          </div>
          <CurrentUserBadge />
        </div>
        <nav className="mx-auto flex max-w-[1600px] flex-wrap gap-1 px-4">
          {tabs.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              className="rounded-t-md px-3 py-2 text-sm transition-colors"
              activeOptions={{ exact: t.to === "/" }}
              inactiveProps={{
                className: "text-primary-foreground/75 hover:bg-primary-foreground/10",
              }}
              activeProps={{
                className: "bg-background text-foreground font-semibold",
              }}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}


function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const isAuthPage = router.state.location.pathname.startsWith("/auth");

  return (
    <QueryClientProvider client={queryClient}>
      <StoreProvider>
        {isAuthPage ? <Outlet /> : <Chrome />}
        <Toaster />
      </StoreProvider>
    </QueryClientProvider>
  );
}
