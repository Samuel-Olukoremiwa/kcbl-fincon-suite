import { ClipboardEdit } from "lucide-react";
import { requirePageAccess } from "@/lib/viewer";
import EditRequestsClient from "./edit-requests-client";

export default async function EditRequestsPage() {
  const viewer = await requirePageAccess("editRequests");
  return (
    <div>
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-navy text-white">
          <ClipboardEdit size={20} />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Update Requests</h1>
          <p className="text-sm text-slate-500">Proposed changes to users, clients, and partner records await Authorizer review.</p>
        </div>
      </header>
      <EditRequestsClient viewer={{ userId: viewer.userId, roleName: viewer.roleName }} />
    </div>
  );
}