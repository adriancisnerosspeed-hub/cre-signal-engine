"use client";

export type TrajectoryScan = {
  id: string;
  created_at: string;
  risk_index_score: number | null;
  risk_index_band: string | null;
  risk_index_breakdown?: {
    delta_comparable?: boolean;
    tier_drivers?: string[];
  } | null;
};

const BAND_COLORS: Record<string, string> = {
  Low: "#22c55e",
  Moderate: "#eab308",
  Elevated: "#f97316",
  High: "#ef4444",
};
const FALLBACK_COLOR = "#71717a";

const CHART_PADDING = { top: 12, right: 12, bottom: 28, left: 32 };
const VIEW_WIDTH = 400;
const VIEW_HEIGHT = 160;
const POINT_R = 4;
const MARKER_SIZE = 6;

function getBandColor(band: string | null): string {
  if (!band) return FALLBACK_COLOR;
  return BAND_COLORS[band] ?? FALLBACK_COLOR;
}

export default function RiskTrajectoryChart({ scans }: { scans: TrajectoryScan[] }) {
  const withScore = scans.filter((s) => s.risk_index_score != null);
  const sorted = [...withScore].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  if (sorted.length === 0) {
    return (
      <p style={{ fontSize: 14, color: "#a1a1aa" }}>No trajectory data — run a scan to see score over time.</p>
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
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "auto", minHeight: 120 }}
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
              fill={getBandColor(band as string)}
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
                stroke={color}
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
            stroke={getBandColor(points[0].scan.risk_index_band)}
            strokeWidth={2}
            strokeLinecap="round"
          />
        )}

        {/* Points */}
        {points.map((p) => (
          <g key={p.scan.id}>
            <circle
              cx={p.x}
              cy={p.y}
              r={POINT_R}
              fill={getBandColor(p.scan.risk_index_band)}
              stroke="rgba(0,0,0,0.2)"
              strokeWidth={1}
            />
            {hasTierOverride(p.scan) && (
              <g
                transform={`translate(${p.x}, ${p.y - POINT_R - MARKER_SIZE - 2})`}
              >
                <title>Tier override</title>
                <path
                  d={`M 0 ${MARKER_SIZE} L ${-MARKER_SIZE} ${-MARKER_SIZE} L ${MARKER_SIZE} ${-MARKER_SIZE} Z`}
                  fill="#eab308"
                  stroke="rgba(0,0,0,0.3)"
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
                  fill="rgb(200, 140, 0)"
                  stroke="rgba(0,0,0,0.3)"
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
          fill="#71717a"
          fontSize={10}
        >
          100
        </text>
        <text
          x={CHART_PADDING.left - 6}
          y={CHART_PADDING.top + plotHeight}
          textAnchor="end"
          dominantBaseline="middle"
          fill="#71717a"
          fontSize={10}
        >
          0
        </text>
      </svg>

      {/* X-axis: dates below chart */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 4,
          paddingLeft: CHART_PADDING.left,
          paddingRight: CHART_PADDING.right,
          fontSize: 10,
          color: "#71717a",
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
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px 16px",
            marginTop: 8,
            fontSize: 11,
            color: "#a1a1aa",
          }}
        >
          {sorted.some(hasTierOverride) && (
            <span>
              <span style={{ color: "#eab308" }}>▲</span> Tier override
            </span>
          )}
          {sorted.some(hasVersionDrift) && (
            <span>
              <span style={{ color: "rgb(200, 140, 0)" }}>◆</span> Version drift
            </span>
          )}
        </div>
      )}
    </div>
  );
}
