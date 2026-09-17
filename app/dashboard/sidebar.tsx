"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Menu, X, LayoutDashboard, Users, FileCheck2, Banknote, FileText,
  Building2, BriefcaseBusiness, Landmark, Settings, ClipboardEdit, Wrench, ContactRound,
} from "lucide-react";
import { useState } from "react";
import { canAccess, type ModuleKey } from "@/lib/access";
import type { Viewer } from "@/lib/viewer";

type NavItem = { href: string; label: string; icon: React.ElementType };
type SidebarViewer = Pick<Viewer, "roleName" | "userType" | "department" | "accessLevel">;

export default function Sidebar({
  roleName, userType, department, accessLevel,
}: SidebarViewer) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isClient = userType === "Client";

  const viewer: Viewer = {
    userId: "", authUserId: "", fullName: "",
    roleName, userType, department, accessLevel,
  };

  const allItems: (NavItem & { module: ModuleKey })[] = isClient
  ? [
      {
        href: "/dashboard/portal",
        label: "My Project Portal",
        icon: LayoutDashboard,
        module: "dashboard",
      },
      {
        href: "/dashboard/reports",
        label: "Progress Reports",
        icon: FileText,
        module: "reports",
      },
    ]
  : [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, module: "dashboard" },
      { href: "/dashboard/users", label: "User Management", icon: Users, module: "users" },
      { href: "/dashboard/clients", label: "Clients & KYC", icon: FileCheck2, module: "clients" },
      { href: "/dashboard/projects", label: "Projects", icon: Building2, module: "projects" },
      { href: "/dashboard/directory", label: "Clients & Projects", icon: ContactRound, module: "projects" },
      { href: "/dashboard/partners", label: "Suppliers & Subcontractors", icon: BriefcaseBusiness, module: "suppliers" },
      { href: "/dashboard/transactions", label: "Transactions", icon: Banknote, module: "transactions" },
      { href: "/dashboard/audit", label: "Audit Trail", icon: Landmark, module: "audit" },
      { href: "/dashboard/reports", label: "Progress Reports", icon: FileText, module: "reports" },
      { href: "/dashboard/assignments", label: "Project Assignments", icon: ContactRound, module: "assignments" },
      { href: "/dashboard/maintenance", label: "Master Data", icon: Wrench, module: "maintenance" },
      { href: "/dashboard/edit-requests", label: "Update Requests", icon: ClipboardEdit, module: "editRequests" },
      { href: "/dashboard/settings", label: "Security Settings", icon: Settings, module: "settings" },
    ];

  const items = allItems.filter((item) => canAccess(viewer, item.module));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed left-4 top-3 z-10 rounded-md bg-navy p-2 text-white shadow md:hidden"
        aria-label="Open navigation"
      >
        <Menu size={20} />
      </button>
      {open && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-20 bg-slate-950/40 md:hidden"
        />
      )}
      <aside
        className={
          (open ? "translate-x-0 " : "-translate-x-full ") +
          "fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-navy-900 transition-transform md:translate-x-0"
        }
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
          <Image src="/kcbl-mark.png" alt="" width={30} height={30} />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white">KCBL</p>
            <p className="text-[11px] uppercase tracking-[0.18em] text-amber">FinCon Suite</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="ml-auto text-white/60 md:hidden" aria-label="Close navigation">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
          {items.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={
                  "flex items-center gap-3 rounded-md border-l-2 py-2.5 pl-2.5 pr-3 text-sm font-medium transition-colors " +
                  (active
                    ? "border-amber bg-white/10 text-white"
                    : "border-transparent text-white/70 hover:bg-white/5 hover:text-white")
                }
              >
                <Icon size={18} strokeWidth={1.75} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 px-5 py-4">
          <p className="text-xs font-medium text-white/80">{roleName}</p>
          <p className="text-[11px] leading-relaxed text-white/40">
            Project Financial Control &amp; Performance Management
          </p>
        </div>
      </aside>
    </>
  );
}
