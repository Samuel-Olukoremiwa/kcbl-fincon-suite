import { Landmark } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePageAccess } from "@/lib/viewer";
import { canViewFinancialRecords } from "@/lib/access";
import AuditWorkspace from "./audit-workspace";
import PageHeader from "../page-header";

export default async function AuditPage() {
  const viewer = await requirePageAccess("audit");
  const canViewFinancial = canViewFinancialRecords(viewer);

  const supabase = createAdminClient();

  const [
    { data: inflows },
    { data: outflows },
    { data: logs },
    { data: users },
    { data: projects },
    { data: progressReports },
  ] = await Promise.all([
    supabase
      .from("cashinflowreceivables")
      .select(
        canViewFinancial
          ? "transactionid,projectid,amount,makeruserid,checkeruserid,approvalstatus,approvaldate"
          : "transactionid,projectid,makeruserid,checkeruserid,approvalstatus,approvaldate",
      )
      .order("transactionid", { ascending: false }),

    supabase
      .from("cashoutflowexpenditure")
      .select(
        canViewFinancial
          ? "transactionid,projectid,amount,makeruserid,checkeruserid,approvalstatus,approvaldate"
          : "transactionid,projectid,makeruserid,checkeruserid,approvalstatus,approvaldate",
      )
      .order("transactionid", { ascending: false }),

    supabase
      .from("makercheckerauditlog")
      .select(
        "logid,transactiontype,transactionid,actiontype,actionbyuserid,actiondate,actiontime,comments",
      )
      .order("actiondate", { ascending: false })
      .order("actiontime", { ascending: false }),

    supabase.from("users").select("userid,fullname"),

    supabase.from("projects").select("projectid,projecttitle"),

    supabase
      .from("projectreports")
      .select(
        "reportid,projectid,reportweek,filename,reviewstatus,progresspct,uploadedat,uploadedbyuserid,supervisorreviewedat,supervisorreviewedbyuserid,authorizedat,authorizedbyuserid,supervisorcomments",
      )
      .order("uploadedat", { ascending: false }),
  ]);

  const userNames = new Map(
    (users ?? []).map((user) => [user.userid, user.fullname]),
  );

  const projectNames = new Map(
    (projects ?? []).map((project) => [
      project.projectid,
      project.projecttitle,
    ]),
  );

  const logsFor = (transactionId: string) =>
    (logs ?? []).filter((log) => log.transactionid === transactionId);

  const transactions = [
    ...(inflows ?? []).map((transaction: any) => ({
      ...transaction,
      direction: "Inflow",
    })),
    ...(outflows ?? []).map((transaction: any) => ({
      ...transaction,
      direction: "Outflow",
    })),
  ].map((transaction) => {
    const entries = logsFor(transaction.transactionid);

    const initiated = entries.find((entry) => entry.actiontype === "Created");

    const authorized = entries.find(
      (entry) =>
        entry.actiontype === "Approved" || entry.actiontype === "Rejected",
    );

    const overridden = entries.find((entry) => entry.actiontype === "Overridden");

    return {
      id: transaction.transactionid,
      direction: transaction.direction,
      amount: transaction.amount,
      projectName: transaction.projectid
        ? projectNames.get(transaction.projectid)
        : null,
      initiatorName:
        userNames.get(transaction.makeruserid) ?? transaction.makeruserid,
      initiatedDate: initiated?.actiondate ?? null,
      initiatedTime: initiated?.actiontime ?? null,
      authorizerName: transaction.checkeruserid
        ? (userNames.get(transaction.checkeruserid) ??
          transaction.checkeruserid)
        : null,
      authorizedDate: authorized?.actiondate ?? transaction.approvaldate,
      authorizedTime: authorized?.actiontime ?? null,
      status: transaction.approvalstatus,
      overridden: Boolean(overridden),
      overrideReason: overridden?.comments ?? null,
      overrideBy: overridden
        ? (userNames.get(overridden.actionbyuserid) ?? overridden.actionbyuserid)
        : null,
    };
  });

  const records = (logs ?? [])
    .filter((log) =>
      ["Client", "Project", "Supplier", "Subcontractor"].includes(
        log.transactiontype,
      ),
    )
    .map((log) => ({
      ...log,
      id: log.transactionid,
      type: log.transactiontype,
      userName: userNames.get(log.actionbyuserid) ?? log.actionbyuserid,
      date: log.actiondate,
      time: log.actiontime,
    }));

  const reports = (progressReports ?? []).map((report) => ({
    id: report.reportid,
    projectName: projectNames.get(report.projectid) ?? report.projectid,
    filename: report.filename,
    week: report.reportweek,
    status: report.reviewstatus,
    progress: report.progresspct,
    submittedBy:
      userNames.get(report.uploadedbyuserid) ?? report.uploadedbyuserid,
    submittedAt: report.uploadedat,
    reviewedBy: report.supervisorreviewedbyuserid
      ? (userNames.get(report.supervisorreviewedbyuserid) ??
        report.supervisorreviewedbyuserid)
      : null,
    reviewedAt: report.supervisorreviewedat,
    authorizedBy: report.authorizedbyuserid
      ? (userNames.get(report.authorizedbyuserid) ?? report.authorizedbyuserid)
      : null,
    authorizedAt: report.authorizedat,
    comments: report.supervisorcomments,
  }));

  return (
    <div>
      <PageHeader
        icon={Landmark}
        title="Audit Trail"
        description="Transaction, record, and Progress Report history."
      />

      <AuditWorkspace
        transactions={transactions}
        records={records}
        progressReports={reports}
        canViewFinancial={canViewFinancial}
      />
    </div>
  );
}