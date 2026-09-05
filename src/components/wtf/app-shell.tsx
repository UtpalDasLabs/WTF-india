import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Compass, PlusCircle, ShieldCheck, UserRound } from "lucide-react";

import { WtfLogo } from "@/components/wtf/logo";
import { useSession } from "@/hooks/use-session";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: ReactNode }) {
  const session = useSession();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  const items = [
    { to: "/", label: "Discover", icon: Compass },
    { to: "/suggest", label: "Suggest", icon: PlusCircle },
    ...(session.isReviewer
      ? [{ to: "/admin", label: "Review", icon: ShieldCheck } as const]
      : []),
    { to: "/auth", label: session.userId ? "Account" : "Sign in", icon: UserRound },
  ];

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/85 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" aria-label="We the Future home">
            <WtfLogo />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4">{children}</main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface-container/95 backdrop-blur"
      >
        <ul className="mx-auto flex max-w-3xl items-stretch">
          {items.map((item) => {
            const active =
              item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <li key={item.to} className="flex-1">
                <Link
                  to={item.to}
                  className="m3-state flex flex-col items-center gap-1 py-2.5 text-xs font-medium"
                >
                  <span
                    className={cn(
                      "grid h-8 w-16 place-items-center rounded-full transition-colors",
                      active
                        ? "bg-secondary-container text-secondary-container-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className={active ? "text-foreground" : "text-muted-foreground"}>
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
