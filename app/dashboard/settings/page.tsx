import { Settings } from "lucide-react";
import { getViewer } from "@/lib/viewer";
import { redirect } from "next/navigation";
import SettingsTabs from "./settings-tabs";

export default async function SettingsPage() {
  const viewer = await getViewer();

  const allowed =
    viewer.roleName === "Super User" ||
    viewer.department === "Audit/Internal Control" ||
    viewer.department === "Finance & Admin" ||
    viewer.department === "MD Office";

  if (!allowed) {
    redirect("/dashboard");
  }

  return (
    <div>
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-navy text-white">
          <Settings size={20} />
        </div>

        <div>
          <h1 className="text-xl font-semibold">
            Security settings
          </h1>

          <p className="text-sm text-slate-500">
            Data Archive uses a three-stage Audit, Finance &amp;
            Admin, and MD Office approval workflow.
          </p>
        </div>
      </header>

      <SettingsTabs
        role={viewer.roleName}
        department={viewer.department}
        canArchive={false}
      />
    </div>
  );
}