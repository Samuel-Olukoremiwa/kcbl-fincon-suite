"use client";

import { ArrowUp, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { canAccess, type ModuleKey } from "@/lib/access";
import type { Viewer } from "@/lib/viewer";

const pages: { href: string; label: string; module: ModuleKey }[] = [
  { href: "/dashboard", label: "Dashboard", module: "dashboard" },
  { href: "/dashboard/users", label: "User Management", module: "users" },
  { href: "/dashboard/clients", label: "Clients & KYC", module: "clients" },
  { href: "/dashboard/projects", label: "Projects", module: "projects" },
  {
    href: "/dashboard/directory",
    label: "Clients & Projects",
    module: "projects",
  },
  {
    href: "/dashboard/partners",
    label: "Suppliers & Subcontractors",
    module: "suppliers",
  },
  {
    href: "/dashboard/transactions",
    label: "Transactions",
    module: "transactions",
  },
  { href: "/dashboard/audit", label: "Audit Trail", module: "audit" },
  { href: "/dashboard/reports", label: "Progress Reports", module: "reports" },
  {
    href: "/dashboard/assignments",
    label: "Project Assignments",
    module: "assignments",
  },
  {
    href: "/dashboard/settings",
    label: "Security Settings",
    module: "settings",
  },
];

export default function DashboardTools({
  viewer,
}: {
  viewer: Pick<Viewer, "roleName" | "userType" | "department" | "accessLevel">;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showTop, setShowTop] = useState(false);
  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 300);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const allowed = useMemo(
    () =>
      pages.filter(
        (page) =>
          canAccess(
            { ...viewer, userId: "", authUserId: "", fullName: "" },
            page.module,
          ) &&
          page.href !== pathname &&
          page.label.toLowerCase().includes(query.toLowerCase()),
      ),
    [viewer, pathname, query],
  );
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 lg:inline-flex"
        aria-label="Search available pages"
      >
        <Search size={16} /> Search <kbd className="ml-3 text-xs">⌘K</kbd>
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/40 p-4 pt-24"
          role="dialog"
          aria-modal="true"
          aria-label="Site search"
        >
          <div className="w-full max-w-lg rounded-lg bg-white p-4 shadow-xl dark:bg-slate-900">
            <div className="flex items-center gap-2">
              <Search size={18} />
              <input
                autoFocus
                className="w-full bg-transparent py-2 outline-none"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search available pages…"
              />
            </div>
            <div className="mt-3 border-t pt-2">
              {allowed.map((page) => (
                <Link
                  key={page.href}
                  href={page.href}
                  onClick={() => setOpen(false)}
                  className="block rounded px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {page.label}
                </Link>
              ))}
              {!allowed.length && (
                <p className="px-3 py-4 text-sm text-slate-500">
                  No available pages match.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
      {showTop && (
        <button
          type="button"
          className="fixed bottom-5 right-5 z-30 rounded-full bg-navy p-3 text-white shadow-lg hover:bg-navy-600"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Back to top"
        >
          <ArrowUp size={18} />
        </button>
      )}
    </>
  );
}
