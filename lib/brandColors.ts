/**
 * Brand color system for CRE Signal Engine.
 *
 * Centralizes risk-band palette. CSS custom properties in app/globals.css
 * are the source of truth for rendered UI (they adapt to light/dark theme).
 * This module provides theme-aware hex values for contexts that cannot use
 * CSS (SVG charts, PDF export, inline style resolution).
 */

export type RiskBand = "Low" | "Moderate" | "Elevated" | "High";

const BAND_LIGHT: Record<RiskBand, string> = {
  Low: "#059669",      // emerald-600
  Moderate: "#d97706", // amber-600
  Elevated: "#ea580c", // orange-600
  High: "#dc2626",     // red-600
};

const BAND_DARK: Record<RiskBand, string> = {
  Low: "#34d399",      // emerald-400
  Moderate: "#fbbf24", // amber-400
  Elevated: "#fb923c", // orange-400
  High: "#f87171",     // red-400
};

/**
 * Light-mode band palette. Use for PDF exports (print on white) or when
 * the rendering surface is guaranteed light.
 */
export const BAND_COLORS_LIGHT = BAND_LIGHT;

/**
 * Dark-mode band palette. Use when rendering surface is guaranteed dark.
 */
export const BAND_COLORS_DARK = BAND_DARK;

const FALLBACK_LIGHT = "#52525b"; // zinc-600
const FALLBACK_DARK = "#a1a1aa";  // zinc-400

export function getBandColor(
  band: string | null | undefined,
  theme: "light" | "dark" = "light",
): string {
  const palette = theme === "dark" ? BAND_DARK : BAND_LIGHT;
  const fallback = theme === "dark" ? FALLBACK_DARK : FALLBACK_LIGHT;
  if (!band) return fallback;
  return palette[band as RiskBand] ?? fallback;
}

/**
 * CSS custom-property reference for a band. Resolves to the correct color
 * at render time via the :root/.dark declarations in globals.css.
 *
 * Example: style={{ color: getBandCssVar("Moderate") }}
 */
export function getBandCssVar(band: string | null | undefined): string {
  if (!band) return "var(--muted-foreground)";
  const key = band.toLowerCase();
  if (key === "low" || key === "moderate" || key === "elevated" || key === "high") {
    return `var(--band-${key})`;
  }
  return "var(--muted-foreground)";
}

/**
 * RGB triplet (0–1 floats) for pdf-lib. Always returns light-mode palette
 * since PDFs are printed on white.
 */
export function getBandRgbTriplet(band: RiskBand | string): [number, number, number] {
  const map: Record<RiskBand, [number, number, number]> = {
    Low:      [0.020, 0.588, 0.412], // #059669
    Moderate: [0.851, 0.463, 0.024], // #d97706
    Elevated: [0.918, 0.345, 0.047], // #ea580c
    High:     [0.863, 0.149, 0.149], // #dc2626
  };
  return map[band as RiskBand] ?? [0.443, 0.443, 0.478];
}
