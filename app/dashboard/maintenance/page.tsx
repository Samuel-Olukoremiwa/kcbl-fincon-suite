import { Wrench } from "lucide-react";
import { requirePageAccess } from "@/lib/viewer";
import CategoriesManager from "./categories-manager";

export default async function MaintenancePage() {
  const viewer = await requirePageAccess("maintenance");
  return (
    <div>
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-navy text-white">
          <Wrench size={20} />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Master Data</h1>
          <p className="text-sm text-slate-500">Manage the reference lists used across the system.</p>
        </div>
      </header>
      <CategoriesManager canManage={viewer.roleName === "Super User"} />
    </div>
  );
}