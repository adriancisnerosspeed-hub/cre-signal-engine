"use client";

import { useState } from "react";
import { getBandCssVar } from "@/lib/brandColors";

export type TrajectoryScan = {
  id: string;
  created_at: string;
  risk_index_score: number | null;
  risk_index_band: string | null;
  risk_index_version?: string | null;
  risk_index_breakdown?: {
    delta_comparable?: boolean;
    tier_drivers?: string[];
  } | null;
};

const CHART_PADDING = { top: 12, right: 12, bottom: 28, left: 32 };
const VIEW_WIDTH = 400;
const VIEW_HEIGHT = 160;
const POINT_R = 4;
const MARKER_SIZE = 6;

function getBandColor(band: string | null): string {
  return getBandCssVar(band);
}

export default function RiskTrajectoryChart({ scans }: { scans: TrajectoryScan[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const withScore = scans.filter((s) => s.risk_index_score != null);
  const sorted = [...withScore].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  if (sorted.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No trajectory data — run a scan to see score over time.</p>
    );
  }

  const minScore = 0;
  const maxScore = 100;
  const scoreRange = maxScore - minScore || 1;
  const plotWidth = VIEW_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
  const plotHeight = VIEW_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;

  const n = sorted.length;
  const xStep = n === 1 ? 0 : plotWidth / Math.max(n - 1, 1);

  const toX = (i: number) => CHART_PADDING.left + (n === 1 ? plotWidth / 2 : i * xStep);
  const toY = (score: number) => {
    const normalized = (score - minScore) / scoreRange;
    return CHART_PADDING.top + plotHeight - normalized * plotHeight;
  };

  const points = sorted.map((s, i) => ({
    x: toX(i),
    y: toY(s.risk_index_score ?? 0),
    scan: s,
    i,
  }));

  const hasTierOverride = (s: TrajectoryScan) =>
    (s.risk_index_breakdown?.tier_drivers?.length ?? 0) > 0;
  const hasVersionDrift = (s: TrajectoryScan) =>
    s.risk_index_breakdown?.delta_comparable === false;

  return (
    <div style={{ width: "100%", maxWidth: "100%", overflow: "hidden" }}>
      <div style={{ position: "relative" }}>
      {/* Hover tooltip */}
      {hoveredIndex !== null && (
        <div
          className="bg-card border border-border rounded-md text-foreground"
          style={{
            position: "absolute",
            left: `${(points[hoveredIndex].x / VIEW_WIDTH) * 100}%`,
            top: `${(points[hoveredIndex].y / VIEW_HEIGHT) * 100}%`,
            transform: "translate(-50%, calc(-100% - 10px))",
            padding: "8px 12px",
            fontSize: 12,
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 10,
          }}
        >
          <div style={{ fontWeight: 700, color: getBandColor(points[hoveredIndex].scan.risk_index_band) }}>
            Score: {points[hoveredIndex].scan.risk_index_score}
          </div>
          <div className="text-muted-foreground">{points[hoveredIndex].scan.risk_index_band ?? "Unknown"}</div>
          {points[hoveredIndex].scan.risk_index_version && (
            <div className="text-muted-foreground/70" style={{ fontSize: 11 }}>v{points[hoveredIndex].scan.risk_index_version}</div>
          )}
          <div className="text-muted-foreground/70" style={{ fontSize: 11 }}>
            {new Date(points[hoveredIndex].scan.created_at).toLocaleDateString()}
          </div>
        </div>
      )}
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "auto", minHeight: 120, display: "block" }}
        aria-label="Risk score over time"
      >
        {/* Y-axis band background (0–34 Low, 35–54 Moderate, 55–69 Elevated, 70+ High) */}
        {[
          [0, 35, "Low"],
          [35, 55, "Moderate"],
          [55, 70, "Elevated"],
          [70, 100, "High"],
        ].map(([lo, hi, band]) => {
          const yTop = toY(hi as number);
          const yBottom = toY(lo as number);
          return (
            <rect
              key={band as string}
              x={CHART_PADDING.left}
              y={yTop}
              width={plotWidth}
              height={yBottom - yTop}
              style={{ fill: getBandColor(band as string) }}
              opacity={0.15}
            />
          );
        })}

        {/* Line: segment by segment with band color */}
        {points.length >= 2 &&
          points.slice(0, -1).map((p, i) => {
            const next = points[i + 1];
            const color = getBandColor(p.scan.risk_index_band);
            return (
              <line
                key={p.scan.id}
                x1={p.x}
                y1={p.y}
                x2={next.x}
                y2={next.y}
                style={{ stroke: color }}
                strokeWidth={2}
                strokeLinecap="round"
              />
            );
          })}

        {/* Single point or segment for single scan */}
        {points.length === 1 && (
          <line
            x1={points[0].x - 20}
            y1={points[0].y}
            x2={points[0].x + 20}
            y2={points[0].y}
            style={{ stroke: getBandColor(points[0].scan.risk_index_band) }}
            strokeWidth={2}
            strokeLinecap="round"
          />
        )}

        {/* Points */}
        {points.map((p) => (
          <g
            key={p.scan.id}
            onMouseEnter={() => setHoveredIndex(p.i)}
            onMouseLeave={() => setHoveredIndex(null)}
            style={{ cursor: "pointer" }}
          >
            <circle
              cx={p.x}
              cy={p.y}
              r={POINT_R + 4}
              fill="transparent"
            />
            <circle
              cx={p.x}
              cy={p.y}
              r={POINT_R}
              style={{ fill: getBandColor(p.scan.risk_index_band), stroke: "rgba(0,0,0,0.2)" }}
              strokeWidth={1}
            />
            {hasTierOverride(p.scan) && (
              <g
                transform={`translate(${p.x}, ${p.y - POINT_R - MARKER_SIZE - 2})`}
              >
                <title>Tier override</title>
                <path
                  d={`M 0 ${MARKER_SIZE} L ${-MARKER_SIZE} ${-MARKER_SIZE} L ${MARKER_SIZE} ${-MARKER_SIZE} Z`}
                  style={{ fill: "var(--band-moderate)", stroke: "rgba(0,0,0,0.3)" }}
                  strokeWidth={1}
                />
              </g>
            )}
            {hasVersionDrift(p.scan) && (
              <g
                transform={`translate(${p.x}, ${p.y + POINT_R + MARKER_SIZE + 2})`}
              >
                <title>Version drift</title>
                <path
                  d={`M 0 ${-MARKER_SIZE} L ${MARKER_SIZE} 0 L 0 ${MARKER_SIZE} L ${-MARKER_SIZE} 0 Z`}
                  style={{ fill: "var(--band-elevated)", stroke: "rgba(0,0,0,0.3)" }}
                  strokeWidth={1}
                />
              </g>
            )}
          </g>
        ))}

        {/* Y-axis labels */}
        <text
          x={CHART_PADDING.left - 6}
          y={CHART_PADDING.top}
          textAnchor="end"
          dominantBaseline="hanging"
          className="fill-muted-foreground/70"
          fontSize={10}
        >
          100
        </text>
        <text
          x={CHART_PADDING.left - 6}
          y={CHART_PADDING.top + plotHeight}
          textAnchor="end"
          dominantBaseline="middle"
          className="fill-muted-foreground/70"
          fontSize={10}
        >
          0
        </text>
      </svg>
      </div>{/* end position:relative wrapper */}

      {/* Single-scan prompt */}
      {sorted.length === 1 && (
        <p className="text-[13px] text-muted-foreground/70 mt-2 italic">
          Re-scan this deal to track risk over time.
        </p>
      )}

      {/* X-axis: dates below chart */}
      <div
        className="text-muted-foreground/70"
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 4,
          paddingLeft: CHART_PADDING.left,
          paddingRight: CHART_PADDING.right,
          fontSize: 10,
        }}
      >
        {sorted.map((s) => (
          <span key={s.id} title={new Date(s.created_at).toLocaleString()}>
            {new Date(s.created_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </span>
        ))}
      </div>

      {/* Legend for markers */}
      {(sorted.some(hasTierOverride) || sorted.some(hasVersionDrift)) && (
        <div
          className="text-muted-foreground"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px 16px",
            marginTop: 8,
            fontSize: 11,
          }}
        >
          {sorted.some(hasTierOverride) && (
            <span>
              <span style={{ color: "var(--band-moderate)" }}>&#9650;</span> Tier override
            </span>
          )}
          {sorted.some(hasVersionDrift) && (
            <span>
              <span style={{ color: "var(--band-elevated)" }}>&#9670;</span> Version drift
            </span>
          )}
        </div>
      )}
    </div>
  );
}
