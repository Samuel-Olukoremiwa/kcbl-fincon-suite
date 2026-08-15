"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  FileCheck2,
  Banknote,
  Building2,
  Truck,
  HardHat,
  Landmark,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
};

export default function Sidebar({ roleName, userType }: { roleName: string; userType: "Staff" | "Client" }) {
  const pathname = usePathname();
  const isClient = userType === "Client";
  const isSuperAdmin = roleName === "Super Admin";

  const items: NavItem[] = isClient
    ? [
        { href: "/dashboard/portal", label: "My Project Portal", icon: LayoutDashboard },
      ]
    : [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        ...(isSuperAdmin ? [{ href: "/dashboard/users", label: "User Management", icon: Users }] : []),
        { href: "/dashboard/clients", label: "Clients & KYC", icon: FileCheck2 },
        { href: "/dashboard/projects", label: "Projects", icon: Building2 },
        { href: "/dashboard/suppliers", label: "Suppliers", icon: Truck },
        { href: "/dashboard/subcontractors", label: "Subcontractors", icon: HardHat },
        { href: "/dashboard/transactions", label: "Transactions", icon: Banknote },
        { href: "/dashboard/audit", label: "Audit Trail", icon: Landmark },
      ];

  return (
    <aside className="fixed inset-y-0 left-0 z-20 flex w-64 flex-col bg-navy-900">
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
        <Image src="/kcbl-mark.png" alt="" width={30} height={30} />
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
            KCBL
          </p>
          <p className="text-[11px] uppercase tracking-[0.18em] text-amber">
            FinCon Suite
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-5">
        {items.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
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
        <p className="text-[11px] leading-relaxed text-white/40">
          Project Financial Control &amp; Performance Management
        </p>
      </div>
    </aside>
  );
}
