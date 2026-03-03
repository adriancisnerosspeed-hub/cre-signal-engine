/**
 * Live macro data from FRED (St. Louis Fed).
 * Requires FRED_API_KEY env var (free at fred.stlouisfed.org).
 * All failures are silent — narrative generation must never be blocked.
 */

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";
const TIMEOUT_MS = 3000;

export type MacroSnapshot = {
  treasury_10yr: string | null;  // e.g. "4.35"
  cpi_yoy: string | null;        // e.g. "3.1" (percent change year-over-year)
  as_of: string;                 // ISO date of most recent observation
};

async function fredGet(seriesId: string, apiKey: string, limit: number): Promise<{ value: string; date: string }[]> {
  const url =
    `${FRED_BASE}?series_id=${seriesId}&api_key=${apiKey}` +
    `&file_type=json&sort_order=desc&limit=${limit}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) return [];
  const json = await res.json() as { observations?: { value: string; date: string }[] };
  return (json.observations ?? []).filter((o) => o.value !== ".");
}

export async function fetchMacroSnapshot(): Promise<MacroSnapshot> {
  const as_of = new Date().toISOString().slice(0, 10);
  const empty: MacroSnapshot = { treasury_10yr: null, cpi_yoy: null, as_of };

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return empty;

  try {
    const [tObs, cpiObs] = await Promise.all([
      fredGet("DGS10",    apiKey, 1),   // 10-year treasury, latest
      fredGet("CPIAUCSL", apiKey, 13),  // CPI, latest 13 months for YoY
    ]);

    const treasury_10yr = tObs[0]?.value ?? null;

    let cpi_yoy: string | null = null;
    if (cpiObs.length >= 13) {
      const latest  = parseFloat(cpiObs[0].value);
      const yearAgo = parseFloat(cpiObs[12].value);
      if (!isNaN(latest) && !isNaN(yearAgo) && yearAgo !== 0) {
        cpi_yoy = ((latest - yearAgo) / yearAgo * 100).toFixed(1);
      }
    }

    const latestDate = tObs[0]?.date ?? cpiObs[0]?.date ?? as_of;
    return { treasury_10yr, cpi_yoy, as_of: latestDate };
  } catch {
    // Never propagate — data fetch must never block narrative generation
    return empty;
  }
}
