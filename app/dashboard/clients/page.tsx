import { FileCheck2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requirePageAccess } from "@/lib/viewer";
import ClientKycForm from "./client-kyc-form";
import EditClientRequest from "./edit-client-request";

export default async function ClientsPage() {
  const viewer = await requirePageAccess("clients");
  const supabase = createClient();
  const [{ data: clients }, { data: clientUsers }] = await Promise.all([
    supabase.from("clients").select("clientid, clienttype, fullnameorcompanyname, email, phonenumber, preferredpaymentmethod, address, idtype, idnumber, issuingauthority, idexpirydate").order("clientid", { ascending: false }),
    viewer.roleName === "Super User"
      ? supabase.from("users").select("userid, fullname, email, roles!inner(rolename)").eq("roles.rolename", "Client").eq("status", "Active")
      : Promise.resolve({ data: [] }),
  ]);

  return <div><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-md bg-navy text-white"><FileCheck2 size={20}/></div><div><h1 className="text-xl font-semibold text-ink">Clients & KYC</h1><p className="text-sm text-slate-500">Onboard clients and capture required KYC records.</p></div></div><div className="mt-8 grid gap-6 xl:grid-cols-[470px_1fr]"><div className="card p-6"><ClientKycForm currentUserId={viewer.userId} existingIds={clients?.map(c=>c.clientid)} clientUsers={(clientUsers ?? []).map(user => ({ userid: user.userid, fullname: user.fullname, email: user.email }))}/></div><div className="card overflow-hidden"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Client</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Payment</th><th className="px-4 py-3">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{clients?.map(c=><tr key={c.clientid}><td className="px-4 py-3"><b>{c.fullnameorcompanyname}</b><span className="block text-xs text-slate-400">{c.clientid}</span></td><td className="px-4 py-3">{c.clienttype}</td><td className="px-4 py-3 text-slate-600">{c.email}<span className="block text-xs">{c.phonenumber}</span></td><td className="px-4 py-3">{c.preferredpaymentmethod}</td><td className="px-4 py-3"><EditClientRequest client={c}/></td></tr>)}{!clients?.length&&<tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">No clients have been created yet.</td></tr>}</tbody></table></div></div></div>;
}