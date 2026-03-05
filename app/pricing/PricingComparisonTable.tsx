const CHECK = "✓";
const DASH = "—";

type Cell = string;

type Row = {
  feature: string;
  starter: Cell;
  analyst: Cell;
  fund: Cell;
  enterprise: Cell;
};

const rows: Row[] = [
  {
    feature: "Scans / month",
    starter: "10",
    analyst: "Unlimited",
    fund: "Unlimited",
    enterprise: "Unlimited",
  },
  {
    feature: "IC Memo PDF export",
    starter: CHECK,
    analyst: CHECK,
    fund: CHECK,
    enterprise: CHECK,
  },
  {
    feature: "Share links",
    starter: CHECK,
    analyst: CHECK,
    fund: CHECK,
    enterprise: CHECK,
  },
  {
    feature: "Risk trajectory",
    starter: DASH,
    analyst: CHECK,
    fund: CHECK,
    enterprise: CHECK,
  },
  {
    feature: "Benchmark percentiles",
    starter: DASH,
    analyst: CHECK,
    fund: CHECK,
    enterprise: CHECK,
  },
  {
    feature: "Governance policies",
    starter: "1",
    analyst: "3",
    fund: "Unlimited",
    enterprise: "Unlimited",
  },
  {
    feature: "Team seats",
    starter: "2",
    analyst: "5",
    fund: "10",
    enterprise: "Unlimited",
  },
  {
    feature: "Custom cohorts",
    starter: DASH,
    analyst: DASH,
    fund: CHECK,
    enterprise: CHECK,
  },
  {
    feature: "API access",
    starter: DASH,
    analyst: DASH,
    fund: DASH,
    enterprise: CHECK,
  },
  {
    feature: "SLA + priority support",
    starter: DASH,
    analyst: DASH,
    fund: CHECK,
    enterprise: CHECK,
  },
];

const COLS = [
  { key: "starter", label: "Starter", price: "$97/mo", highlight: false },
  { key: "analyst", label: "Analyst", price: "$297/mo", highlight: true },
  { key: "fund", label: "Fund", price: "$797/mo", highlight: false },
  { key: "enterprise", label: "Enterprise", price: "Custom", highlight: false },
] as const;

export default function PricingComparisonTable() {
  return (
    <section style={{ marginTop: 48, marginBottom: 32 }}>
      <h2
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: "#e4e4e7",
          marginBottom: 20,
          textAlign: "center",
        }}
      >
        Compare Plans
      </h2>
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 14,
            minWidth: 560,
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  padding: "12px 16px",
                  textAlign: "left",
                  color: "#71717a",
                  fontWeight: 500,
                  borderBottom: "1px solid #3f3f46",
                }}
              />
              {COLS.map((col) => (
                <th
                  key={col.key}
                  style={{
                    padding: "12px 16px",
                    textAlign: "center",
                    color: col.highlight ? "#fafafa" : "#e4e4e7",
                    fontWeight: 700,
                    borderBottom: col.highlight
                      ? "2px solid #3b82f6"
                      : "1px solid #3f3f46",
                    backgroundColor: col.highlight
                      ? "rgba(59,130,246,0.08)"
                      : "transparent",
                    position: "relative",
                  }}
                >
                  {col.highlight && (
                    <div
                      style={{
                        display: "inline-block",
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#fff",
                        backgroundColor: "#3b82f6",
                        borderRadius: 4,
                        padding: "2px 6px",
                        marginBottom: 4,
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                      }}
                    >
                      Most Popular
                    </div>
                  )}
                  <div>{col.label}</div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 400,
                      color: "#a1a1aa",
                      marginTop: 2,
                    }}
                  >
                    {col.price}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.feature}
                style={{
                  backgroundColor:
                    i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)",
                }}
              >
                <td
                  style={{
                    padding: "11px 16px",
                    color: "#a1a1aa",
                    borderBottom: "1px solid #27272a",
                  }}
                >
                  {row.feature}
                </td>
                {COLS.map((col) => {
                  const val = row[col.key];
                  const isCheck = val === CHECK;
                  const isDash = val === DASH;
                  return (
                    <td
                      key={col.key}
                      style={{
                        padding: "11px 16px",
                        textAlign: "center",
                        borderBottom: "1px solid #27272a",
                        backgroundColor: col.highlight
                          ? "rgba(59,130,246,0.04)"
                          : "transparent",
                        color: isCheck
                          ? "#22c55e"
                          : isDash
                            ? "#3f3f46"
                            : "#e4e4e7",
                        fontWeight: isCheck || isDash ? 700 : 500,
                        fontSize: isCheck || isDash ? 16 : 14,
                      }}
                    >
                      {val}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
