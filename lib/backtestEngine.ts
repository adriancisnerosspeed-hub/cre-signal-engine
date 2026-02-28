/**
 * Backtest Analytics Engine: metrics from scans with actual outcomes.
 * No external stats libs — manual, deterministic implementation.
 */

export type BacktestScan = {
  risk_index_score: number | null;
  risk_index_band: string | null;
  actual_outcome_type: string | null;
  actual_outcome_value: number | null;
};

export type MetricsByBand = {
  default_rate: number;
  avg_loss_rate: number;
  count: number;
  defaults: number;
};

export type BacktestMetrics = {
  sample_size: number;
  metrics_by_band: Record<string, MetricsByBand>;
  correlation_score_vs_outcome: number | null;
  discrimination: {
    pct_high_defaulted: number;
    pct_low_defaulted: number;
  };
  predictive_strength: "Weak" | "Moderate" | "Strong";
};

/** Scans with actual_outcome_type set; used for backtest. */
function filterScansWithOutcome<T extends BacktestScan>(scans: T[]): T[] {
  return scans.filter((s) => s.actual_outcome_type != null && s.actual_outcome_type !== "");
}

/** Default = outcome type indicates default and value is truthy (e.g. default_flag with value 1). */
function isDefault(scan: BacktestScan): number {
  if (scan.actual_outcome_type !== "default_flag" && scan.actual_outcome_type !== "default")
    return 0;
  const v = scan.actual_outcome_value;
  if (v == null) return 0;
  return Number(v) > 0 ? 1 : 0;
}

/** Numeric outcome for correlation: use actual_outcome_value when numeric, else 0/1 from default. */
function numericOutcome(scan: BacktestScan): number | null {
  const v = scan.actual_outcome_value;
  if (v != null && typeof v === "number" && !Number.isNaN(v)) return v;
  if (scan.actual_outcome_type === "default_flag" || scan.actual_outcome_type === "default")
    return Number(scan.actual_outcome_value) > 0 ? 1 : 0;
  return null;
}

/** Pearson correlation between two arrays (same length). Returns null if n < 2 or zero variance. */
function pearson(x: number[], y: number[]): number | null {
  const n = x.length;
  if (n !== y.length || n < 2) return null;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  if (varX === 0 || varY === 0) return null;
  const denom = Math.sqrt(varX * varY);
  if (denom === 0) return null;
  const r = cov / denom;
  return Math.max(-1, Math.min(1, r));
}

/**
 * Compute backtest metrics from scans. Only includes scans where actual_outcome_type is not null.
 * Safe for small samples (no crash); deterministic.
 */
export function computeBacktestMetrics(scans: BacktestScan[]): BacktestMetrics {
  const withOutcome = filterScansWithOutcome(scans);
  const sample_size = withOutcome.length;

  const metrics_by_band: Record<string, MetricsByBand> = {};
  const bandKeys = ["Low", "Moderate", "Elevated", "High"];
  const lossSumByBand: Record<string, number> = {};
  const lossCountByBand: Record<string, number> = {};
  for (const b of bandKeys) {
    metrics_by_band[b] = { default_rate: 0, avg_loss_rate: 0, count: 0, defaults: 0 };
    lossSumByBand[b] = 0;
    lossCountByBand[b] = 0;
  }
  for (const s of withOutcome) {
    const band = s.risk_index_band ?? "Low";
    if (!metrics_by_band[band]) {
      metrics_by_band[band] = { default_rate: 0, avg_loss_rate: 0, count: 0, defaults: 0 };
      lossSumByBand[band] = 0;
      lossCountByBand[band] = 0;
    }
    const m = metrics_by_band[band];
    m.count += 1;
    m.defaults += isDefault(s);
    const loss = s.actual_outcome_value != null && typeof s.actual_outcome_value === "number" && !Number.isNaN(s.actual_outcome_value)
      ? s.actual_outcome_value
      : null;
    if (loss !== null) {
      lossSumByBand[band] += loss;
      lossCountByBand[band] += 1;
    }
  }
  for (const band of Object.keys(metrics_by_band)) {
    const m = metrics_by_band[band];
    m.default_rate = m.count > 0 ? m.defaults / m.count : 0;
    const nLoss = lossCountByBand[band] ?? 0;
    m.avg_loss_rate = nLoss > 0 ? (lossSumByBand[band] ?? 0) / nLoss : 0;
  }

  const scores: number[] = [];
  const outcomes: number[] = [];
  for (const s of withOutcome) {
    const score = s.risk_index_score;
    const out = numericOutcome(s);
    if (score != null && !Number.isNaN(score) && out !== null) {
      scores.push(score);
      outcomes.push(out);
    }
  }
  const correlation_score_vs_outcome = pearson(scores, outcomes);

  const highBand = metrics_by_band["High"];
  const lowBand = metrics_by_band["Low"];
  const pct_high_defaulted = highBand && highBand.count > 0 ? highBand.default_rate : 0;
  const pct_low_defaulted = lowBand && lowBand.count > 0 ? lowBand.default_rate : 0;

  const spread = Math.abs(pct_high_defaulted - pct_low_defaulted);
  const absCorr = correlation_score_vs_outcome != null ? Math.abs(correlation_score_vs_outcome) : 0;
  let predictive_strength: "Weak" | "Moderate" | "Strong" = "Weak";
  if (sample_size >= 2 && correlation_score_vs_outcome != null) {
    if (absCorr >= 0.5 && spread >= 0.2) predictive_strength = "Strong";
    else if (absCorr >= 0.3 || spread >= 0.1) predictive_strength = "Moderate";
  }

  return {
    sample_size,
    metrics_by_band,
    correlation_score_vs_outcome: correlation_score_vs_outcome ?? null,
    discrimination: { pct_high_defaulted, pct_low_defaulted },
    predictive_strength,
  };
}
