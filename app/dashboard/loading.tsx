export default function DashboardLoading() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="h-8 w-56 rounded bg-slate-200" />
      <div className="grid gap-5 md:grid-cols-3">
        <div className="h-32 rounded-lg bg-slate-200" />
        <div className="h-32 rounded-lg bg-slate-200" />
        <div className="h-32 rounded-lg bg-slate-200" />
      </div>
      <div className="h-80 rounded-lg bg-slate-200" />
    </div>
  );
}
