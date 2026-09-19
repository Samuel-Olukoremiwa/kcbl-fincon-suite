import { FileCheck2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requirePageAccess } from "@/lib/viewer";
import ClientKycForm from "./client-kyc-form";
import EditClientRequest from "./edit-client-request";
import ClientWorkspace from "./client-workspace";
import { canCreateClientOrProject } from "@/lib/access";
import PageHeader from "../page-header";

export default async function ClientsPage() {
  const viewer = await requirePageAccess("clients");
  const supabase = createClient();
  const [{ data: clients }, { data: clientUsers }] = await Promise.all([
    supabase
      .from("clients")
      .select(
        "clientid, clienttype, fullnameorcompanyname, email, phonenumber, preferredpaymentmethod, address, idtype, idnumber, issuingauthority, idexpirydate",
      )
      .order("clientid", { ascending: false }),
    viewer.roleName === "Super User"
      ? supabase
          .from("users")
          .select("userid, fullname, email, roles!inner(rolename)")
          .eq("roles.rolename", "Client")
          .eq("status", "Active")
      : Promise.resolve({ data: [] }),
  ]);

  return (
    <div>
      <PageHeader
        icon={FileCheck2}
        title="Clients"
        description="Business Development onboards clients; other permitted users can view records."
      />

      <ClientWorkspace
        clients={clients ?? []}
        currentUserId={viewer.userId}
        canCreate={canCreateClientOrProject(viewer)}
        clientUsers={(clientUsers ?? []).map((user) => ({
          userid: user.userid,
          fullname: user.fullname,
          email: user.email,
        }))}
      />
    </div>
  );
}