export function nextPrefixedId(existing: string[] | undefined, prefix: string, width: number) {
  const highest = (existing ?? []).reduce((max, value) => {
    const number = Number.parseInt(value.replace(prefix, ""), 10);
    return Number.isFinite(number) ? Math.max(max, number) : max;
  }, 0);
  return `${prefix}${String(highest + 1).padStart(width, "0")}`;
}

export function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 2 }).format(Number(value ?? 0));
}

export function date(value: string | null | undefined) {
  return value ? new Intl.DateTimeFormat("en-GB").format(new Date(`${value}T00:00:00`)) : "—";
}
