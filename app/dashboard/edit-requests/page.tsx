import { ClipboardEdit } from "lucide-react";

import {
  canDecideEditRequest,
  type EditRequestEntityType,
} from "@/lib/access";

import { requirePageAccess } from "@/lib/viewer";

import EditRequestsClient from "./edit-requests-client";

const EDIT_ENTITY_TYPES:
  EditRequestEntityType[] = [
    "client",
    "supplier",
    "subcontractor",
  ];

export default async function EditRequestsPage() {
  const viewer =
    await requirePageAccess(
      "editRequests",
    );

  const canDecideByType =
    Object.fromEntries(
      EDIT_ENTITY_TYPES.map(
        (entityType) => [
          entityType,

          canDecideEditRequest(
            viewer,
            entityType,
          ),
        ],
      ),
    ) as Record<
      EditRequestEntityType,
      boolean
    >;

  return (
    <div>
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-navy text-white">
          <ClipboardEdit
            size={20}
          />
        </div>

        <div>
          <h1 className="text-xl font-semibold">
            Update Requests
          </h1>

          <p className="text-sm text-slate-500">
            Proposed changes to client, supplier, and subcontractor records
            await the appropriate departmental Authorizer. Staff access is
            managed separately by a Super User.
          </p>
        </div>
      </header>

      <EditRequestsClient
        viewer={{
          userId:
            viewer.userId,

          canDecideByType,
        }}
      />
    </div>
  );
}