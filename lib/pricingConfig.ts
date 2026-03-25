/**
 * Pricing constants for plan display. Source of truth for monthly/annual prices shown on pricing page.
 * Annual prices are 20% off monthly (except Founding Member — same price, locked rate).
 */
export const PRICING = {
  starter: { monthly: 97, annualMonthly: 78, annualTotal: 936 },
  analyst: { monthly: 297, annualMonthly: 238, annualTotal: 2856 },
  fund: { monthly: 797, annualMonthly: 638, annualTotal: 7656 },
  founding: { monthly: 147, annualMonthly: 147, annualTotal: 1764 },
} as const;
