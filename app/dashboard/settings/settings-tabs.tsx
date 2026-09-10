"use client";
import { useState } from "react";
import SessionSettings from "./session-settings";
import DataArchiveTab from "./data-archive-tab";

export default function SettingsTabs({ role, department, canArchive }: { role: string; department: string | null; canArchive: boolean }) {
  const [tab, setTab] = useState<"session" | "archive">("session");

  return (
    <div className="mt-8">
      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setTab("session")}
          className={`border-b-2 px-4 py-3 text-sm font-medium ${tab === "session" ? "border-navy text-navy" : "border-transparent text-slate-500"}`}
        >
          Session Timeout
        </button>
        <button
          onClick={() => setTab("archive")}
          className={`border-b-2 px-4 py-3 text-sm font-medium ${tab === "archive" ? "border-navy text-navy" : "border-transparent text-slate-500"}`}
        >
          Data Archive
        </button>
      </div>

      {tab === "session" && <div className="mt-6"><SessionSettings role={role} department={department} /></div>}
      {tab === "archive" && <div className="mt-6"><DataArchiveTab canArchive={canArchive} /></div>}
    </div>
  );
}