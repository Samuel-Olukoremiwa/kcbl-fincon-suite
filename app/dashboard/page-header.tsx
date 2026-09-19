export default function PageHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <header className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-navy text-white">
        <Icon size={20} />
      </div>
      <div>
        <h1 className="text-xl font-semibold text-ink">{title}</h1>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
    </header>
  );
}