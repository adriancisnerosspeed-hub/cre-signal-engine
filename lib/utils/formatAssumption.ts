export function formatUSD(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatYears(value: number): string {
  return `${value} year${value === 1 ? "" : "s"}`;
}

export function formatRatio(value: number): string {
  return `${value.toFixed(2)}x`;
}

/**
 * Smart-dispatch formatter based on unit string.
 * Returns "--" for null values.
 */
export function formatAssumptionValue(
  value: number | null,
  unit: string | null
): string {
  if (value == null) return "—";
  if (!unit) return String(value);

  const u = unit.toLowerCase().trim();

  if (u === "usd" || u === "$" || u === "dollars") return formatUSD(value);
  if (u === "%" || u === "percent" || u === "pct") return formatPct(value);
  if (u === "years" || u === "year") return formatYears(value);
  if (u === "x" || u === "ratio" || u === "dscr") return formatRatio(value);

  return `${value} ${unit}`;
}
