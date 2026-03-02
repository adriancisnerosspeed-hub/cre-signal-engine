/**
 * Explainability diff: why score changed between two scans.
 * Compares breakdown.contributions (driver + points) and returns deltas.
 */

export type ExplainabilityDiffItem = {
  driver: string;
  previous_points: number;
  current_points: number;
  delta_points: number;
};

type BreakdownLike = {
  contributions?: { driver: string; points: number }[];
  delta_comparable?: boolean;
} | null | undefined;

/**
 * Compute per-driver point diff between latest and previous scan.
 * Returns empty array if either breakdown is missing contributions or delta is not comparable.
 * Safe when breakdown fields are missing.
 */
export function computeExplainabilityDiff(
  latestBreakdown: BreakdownLike,
  previousBreakdown: BreakdownLike,
  deltaComparable?: boolean
): ExplainabilityDiffItem[] {
  if (!deltaComparable && latestBreakdown?.delta_comparable !== true) {
    return [];
  }
  const curr = latestBreakdown?.contributions;
  const prev = previousBreakdown?.contributions;
  if (!Array.isArray(curr) || !Array.isArray(prev)) {
    return [];
  }

  const prevByDriver = new Map<string, number>();
  for (const c of prev) {
    if (typeof c.driver === "string" && typeof c.points === "number" && !Number.isNaN(c.points)) {
      prevByDriver.set(c.driver, (prevByDriver.get(c.driver) ?? 0) + c.points);
    }
  }

  const currByDriver = new Map<string, number>();
  for (const c of curr) {
    if (typeof c.driver === "string" && typeof c.points === "number" && !Number.isNaN(c.points)) {
      currByDriver.set(c.driver, (currByDriver.get(c.driver) ?? 0) + c.points);
    }
  }

  const allDrivers = new Set([...prevByDriver.keys(), ...currByDriver.keys()]);
  const out: ExplainabilityDiffItem[] = [];
  for (const driver of allDrivers) {
    const previous_points = prevByDriver.get(driver) ?? 0;
    const current_points = currByDriver.get(driver) ?? 0;
    const delta_points = current_points - previous_points;
    out.push({ driver, previous_points, current_points, delta_points });
  }

  return out.sort((a, b) => Math.abs(b.delta_points) - Math.abs(a.delta_points));
}
