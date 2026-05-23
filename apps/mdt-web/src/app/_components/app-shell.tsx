"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  ClipboardList,
  ListTodo,
  ScrollText,
  Users,
  ChevronRight,
  LogOut,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const NAV = [
  { href: "/boards", label: "Boards", icon: LayoutGrid },
  { href: "/my-tasks", label: "My tasks", icon: ListTodo },
  { href: "/dn-board", label: "DN board", icon: ClipboardList },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText },
];

// Chrome-free routes (auth surfaces render bare).
function isBare(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/auth");
}

const SEGMENT_LABELS: Record<string, string> = {
  boards: "Boards",
  "my-tasks": "My tasks",
  "dn-board": "DN board",
  admin: "Admin",
  audit: "Audit log",
  patients: "Patient",
  sessions: "Session",
  meeting: "Meeting",
  new: "New",
};

function looksLikeId(seg: string): boolean {
  return seg.length >= 16 || /^[0-9a-f]{8}-/.test(seg);
}

function crumbsFor(pathname: string): { href: string; label: string }[] {
  const parts = pathname.split("/").filter(Boolean);
  const crumbs: { href: string; label: string }[] = [
    { href: "/", label: "Home" },
  ];
  let href = "";
  parts.forEach((seg, i) => {
    href += `/${seg}`;
    let label: string;
    if (SEGMENT_LABELS[seg]) {
      label = SEGMENT_LABELS[seg];
    } else if (looksLikeId(seg)) {
      const prev = parts[i - 1];
      label =
        prev === "boards"
          ? "Board"
          : prev === "patients"
            ? "Patient"
            : prev === "sessions" || prev === "meeting"
              ? "Session"
              : "Detail";
    } else {
      label = seg.charAt(0).toUpperCase() + seg.slice(1);
    }
    crumbs.push({ href, label });
  });
  return crumbs;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (isBare(pathname)) return;
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, [pathname]);

  if (isBare(pathname)) return <>{children}</>;

  const crumbs = crumbsFor(pathname);

  return (
    <div className="flex min-h-full">
      {/* Sidebar — 240px, hairline divider */}
      <aside className="w-60 shrink-0 border-r border-hairline bg-paper-2 flex flex-col">
        <div className="h-14 flex items-center px-5 border-b border-hairline">
          <Link
            href="/"
            className="text-base font-semibold tracking-tight text-ink"
          >
            CareLoop MDT
          </Link>
        </div>
        <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm ${
                  active
                    ? "bg-eucalyptus-100 text-eucalyptus-700 font-medium"
                    : "text-zinc-700 hover:bg-zinc-100"
                }`}
              >
                <Icon size={16} strokeWidth={1.5} aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar — 56px */}
        <header className="h-14 shrink-0 flex items-center justify-end gap-4 px-6 border-b border-hairline bg-paper">
          <span className="text-sm text-zinc-500">{email ?? ""}</span>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              aria-label="Sign out"
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
            >
              <LogOut size={16} strokeWidth={1.5} aria-hidden />
              Sign out
            </button>
          </form>
        </header>

        {/* Breadcrumbs */}
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 px-6 py-2.5 text-sm text-zinc-500 border-b border-hairline overflow-x-auto"
        >
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <span key={c.href} className="flex items-center gap-1.5 shrink-0">
                {i > 0 && (
                  <ChevronRight size={14} strokeWidth={1.5} aria-hidden />
                )}
                {last ? (
                  <span className="text-ink">{c.label}</span>
                ) : (
                  <Link href={c.href} className="hover:text-ink">
                    {c.label}
                  </Link>
                )}
              </span>
            );
          })}
        </nav>

        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
