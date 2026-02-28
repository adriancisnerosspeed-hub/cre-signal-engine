import { describe, it, expect } from "vitest";
import { computeBacktestMetrics, type BacktestScan } from "./backtestEngine";

describe("backtestEngine", () => {
  it("does not crash with empty scans", () => {
    const out = computeBacktestMetrics([]);
    expect(out.sample_size).toBe(0);
    expect(out.metrics_by_band).toBeDefined();
    expect(out.correlation_score_vs_outcome).toBeNull();
    expect(out.discrimination.pct_high_defaulted).toBe(0);
    expect(out.discrimination.pct_low_defaulted).toBe(0);
    expect(["Weak", "Moderate", "Strong"]).toContain(out.predictive_strength);
  });

  it("excludes scans without actual_outcome_type", () => {
    const scans: BacktestScan[] = [
      { risk_index_score: 50, risk_index_band: "Moderate", actual_outcome_type: null, actual_outcome_value: null },
      { risk_index_score: 70, risk_index_band: "High", actual_outcome_type: "", actual_outcome_value: 1 },
    ];
    const out = computeBacktestMetrics(scans);
    expect(out.sample_size).toBe(0);
  });

  it("handles small sample (n=1) without crashing", () => {
    const scans: BacktestScan[] = [
      { risk_index_score: 75, risk_index_band: "High", actual_outcome_type: "default_flag", actual_outcome_value: 1 },
    ];
    const out = computeBacktestMetrics(scans);
    expect(out.sample_size).toBe(1);
    expect(out.metrics_by_band["High"].count).toBe(1);
    expect(out.metrics_by_band["High"].default_rate).toBe(1);
    expect(out.correlation_score_vs_outcome).toBeNull();
    expect(out.predictive_strength).toBe("Weak");
  });

  it("is deterministic for same input", () => {
    const scans: BacktestScan[] = [
      { risk_index_score: 20, risk_index_band: "Low", actual_outcome_type: "default_flag", actual_outcome_value: 0 },
      { risk_index_score: 75, risk_index_band: "High", actual_outcome_type: "default_flag", actual_outcome_value: 1 },
      { risk_index_score: 25, risk_index_band: "Low", actual_outcome_type: "default_flag", actual_outcome_value: 0 },
      { risk_index_score: 72, risk_index_band: "High", actual_outcome_type: "default_flag", actual_outcome_value: 1 },
    ];
    const a = computeBacktestMetrics(scans);
    const b = computeBacktestMetrics(scans);
    expect(a.sample_size).toBe(b.sample_size);
    expect(a.correlation_score_vs_outcome).toBe(b.correlation_score_vs_outcome);
    expect(a.discrimination.pct_high_defaulted).toBe(b.discrimination.pct_high_defaulted);
    expect(a.discrimination.pct_low_defaulted).toBe(b.discrimination.pct_low_defaulted);
    expect(a.predictive_strength).toBe(b.predictive_strength);
  });

  it("computes default_rate_by_band and discrimination", () => {
    const scans: BacktestScan[] = [
      { risk_index_score: 20, risk_index_band: "Low", actual_outcome_type: "default_flag", actual_outcome_value: 0 },
      { risk_index_score: 30, risk_index_band: "Low", actual_outcome_type: "default_flag", actual_outcome_value: 0 },
      { risk_index_score: 75, risk_index_band: "High", actual_outcome_type: "default_flag", actual_outcome_value: 1 },
      { risk_index_score: 80, risk_index_band: "High", actual_outcome_type: "default_flag", actual_outcome_value: 1 },
    ];
    const out = computeBacktestMetrics(scans);
    expect(out.sample_size).toBe(4);
    expect(out.metrics_by_band["Low"].default_rate).toBe(0);
    expect(out.metrics_by_band["High"].default_rate).toBe(1);
    expect(out.discrimination.pct_low_defaulted).toBe(0);
    expect(out.discrimination.pct_high_defaulted).toBe(1);
  });

  it("computes avg_loss_rate when outcome value is numeric", () => {
    const scans: BacktestScan[] = [
      { risk_index_score: 50, risk_index_band: "Moderate", actual_outcome_type: "loss_rate", actual_outcome_value: 0.1 },
      { risk_index_score: 55, risk_index_band: "Moderate", actual_outcome_type: "loss_rate", actual_outcome_value: 0.2 },
    ];
    const out = computeBacktestMetrics(scans);
    expect(out.metrics_by_band["Moderate"].avg_loss_rate).toBeCloseTo(0.15);
  });
});
