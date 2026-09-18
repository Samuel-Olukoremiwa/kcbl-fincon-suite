export function nextPrefixedId(
  existing: string[] | undefined,
  prefix: string,
  width: number,
) {
  const highest = (existing ?? []).reduce((max, value) => {
    const number = Number.parseInt(value.replace(prefix, ""), 10);
    return Number.isFinite(number) ? Math.max(max, number) : max;
  }, 0);
  return `${prefix}${String(highest + 1).padStart(width, "0")}`;
}

export function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

export function date(value: string | null | undefined) {
  if (!value) return "—";
  // Database fields can be a date (YYYY-MM-DD) or a full ISO timestamp.
  // Append a time only to date-only values; appending it to a timestamp makes
  // an invalid value such as 2026-09-17T20:22:49Z'T00:00:00'.
  const input = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value;
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-GB").format(parsed);
}
