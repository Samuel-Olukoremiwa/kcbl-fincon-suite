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
    { data: archiveRequests },
    { data: restorationRequests },
    { data: archiveBatches },
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

    supabase
      .from("archiverequests")
      .select(
        "requestid,financialyear,halfyear,requestedbyuserid,requestedat,financereviewedbyuserid,financereviewedat,financeremarks,mdreviewedbyuserid,mdreviewedat,mdremarks,status,archiveid",
      )
      .order("requestedat", { ascending: false }),

    supabase
      .from("archiverestorationrequests")
      .select(
        "requestid,archiveid,requestedbyuserid,requestedat,financereviewedbyuserid,financereviewedat,financeremarks,mdreviewedbyuserid,mdreviewedat,mdremarks,status,restoredat",
      )
      .order("requestedat", { ascending: false }),

    supabase
      .from("archivebatches")
      .select(
        "archiveid,financialyear,halfyear,archivedat,archivedbyuserid",
      )
      .order("archivedat", { ascending: false }),
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
    (logs ?? []).filter(
      (log) => log.transactionid === transactionId,
    );

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

    const initiated = entries.find(
      (entry) => entry.actiontype === "Created",
    );

    const authorized = entries.find(
      (entry) =>
        entry.actiontype === "Approved" ||
        entry.actiontype === "Rejected",
    );

    const overridden = entries.find(
      (entry) => entry.actiontype === "Overridden",
    );

    return {
      id: transaction.transactionid,
      direction: transaction.direction,
      amount: transaction.amount,
      projectName: transaction.projectid
        ? projectNames.get(transaction.projectid)
        : null,
      initiatorName:
        userNames.get(transaction.makeruserid) ??
        transaction.makeruserid,
      initiatedDate: initiated?.actiondate ?? null,
      initiatedTime: initiated?.actiontime ?? null,
      authorizerName: transaction.checkeruserid
        ? (userNames.get(transaction.checkeruserid) ??
          transaction.checkeruserid)
        : null,
      authorizedDate:
        authorized?.actiondate ?? transaction.approvaldate,
      authorizedTime: authorized?.actiontime ?? null,
      status: transaction.approvalstatus,
      overridden: Boolean(overridden),
      overrideReason: overridden?.comments ?? null,
      overrideBy: overridden
        ? (userNames.get(overridden.actionbyuserid) ??
          overridden.actionbyuserid)
        : null,
    };
  });

  const records = (logs ?? [])
    .filter((log) =>
      [
        "Client",
        "Project",
        "Supplier",
        "Subcontractor",
      ].includes(log.transactiontype),
    )
    .map((log) => ({
      ...log,
      id: log.transactionid,
      type: log.transactiontype,
      userName:
        userNames.get(log.actionbyuserid) ??
        log.actionbyuserid,
      date: log.actiondate,
      time: log.actiontime,
    }));

  const reports = (progressReports ?? []).map((report) => ({
    id: report.reportid,
    projectName:
      projectNames.get(report.projectid) ??
      report.projectid,
    filename: report.filename,
    week: report.reportweek,
    status: report.reviewstatus,
    progress: report.progresspct,
    submittedBy:
      userNames.get(report.uploadedbyuserid) ??
      report.uploadedbyuserid,
    submittedAt: report.uploadedat,
    reviewedBy: report.supervisorreviewedbyuserid
      ? (userNames.get(
          report.supervisorreviewedbyuserid,
        ) ?? report.supervisorreviewedbyuserid)
      : null,
    reviewedAt: report.supervisorreviewedat,
    authorizedBy: report.authorizedbyuserid
      ? (userNames.get(report.authorizedbyuserid) ??
        report.authorizedbyuserid)
      : null,
    authorizedAt: report.authorizedat,
    comments: report.supervisorcomments,
  }));

  const archives = [
    ...(archiveRequests ?? []).map((request: any) => ({
      id: request.requestid,
      type: "Archive Request",
      archiveId: request.archiveid,
      period: `${request.financialyear} — H${request.halfyear}`,
      status: request.status,
      requestedBy:
        userNames.get(request.requestedbyuserid) ??
        request.requestedbyuserid,
      requestedAt: request.requestedat,
      financeReviewedBy: request.financereviewedbyuserid
        ? (userNames.get(
            request.financereviewedbyuserid,
          ) ?? request.financereviewedbyuserid)
        : null,
      financeReviewedAt: request.financereviewedat,
      financeComments: request.financeremarks,
      mdReviewedBy: request.mdreviewedbyuserid
        ? (userNames.get(request.mdreviewedbyuserid) ??
          request.mdreviewedbyuserid)
        : null,
      mdReviewedAt: request.mdreviewedat,
      mdComments: request.mdremarks,
    })),

    ...(restorationRequests ?? []).map((request: any) => ({
      id: request.requestid,
      type: "Restoration Request",
      archiveId: request.archiveid,
      period: `Archive ${request.archiveid}`,
      status: request.status,
      requestedBy:
        userNames.get(request.requestedbyuserid) ??
        request.requestedbyuserid,
      requestedAt: request.requestedat,
      financeReviewedBy: request.financereviewedbyuserid
        ? (userNames.get(
            request.financereviewedbyuserid,
          ) ?? request.financereviewedbyuserid)
        : null,
      financeReviewedAt: request.financereviewedat,
      financeComments: request.financeremarks,
      mdReviewedBy: request.mdreviewedbyuserid
        ? (userNames.get(request.mdreviewedbyuserid) ??
          request.mdreviewedbyuserid)
        : null,
      mdReviewedAt: request.mdreviewedat,
      mdComments: request.mdremarks,
      restoredAt: request.restoredat,
    })),
  ];

  const archiveAuditLogs = (logs ?? [])
    .filter(
      (log) =>
        log.transactiontype === "Archive" ||
        log.transactiontype === "RINF" ||
        log.transactiontype === "REXP",
    )
    .map((log) => ({
      id: log.logid,
      requestId: log.transactionid,
      transactionType: log.transactiontype,
      action: log.actiontype,
      userName:
        userNames.get(log.actionbyuserid) ??
        log.actionbyuserid,
      date: log.actiondate,
      time: log.actiontime,
      comments: log.comments,
    }));

  return (
    <div>
      <PageHeader
        icon={Landmark}
        title="Audit Trail"
        description="Transaction, record, Progress Report, archive, and restoration history."
      />

      <AuditWorkspace
        transactions={transactions}
        records={records}
        progressReports={reports}
        archives={archives}
        archiveAuditLogs={archiveAuditLogs}
        archiveBatches={archiveBatches ?? []}
        canViewFinancial={canViewFinancial}
      />
    </div>
  );
}