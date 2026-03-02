/**
 * Cohort rule DSL: validation, evaluation, and deterministic rule_hash.
 * Allowed operators: eq, neq, in, gte, lte, exists, and, or, not.
 * Allowed fields: only those on deals or deal_scans (see ALLOWED_FIELDS).
 */

import type { CohortRule, CohortEvalContext } from "./types";
import { createHash } from "crypto";

/** Fields that may be used in cohort rules (deal or canonical scan). */
export const ALLOWED_FIELDS = new Set([
  "asset_type",
  "market",
  "market_key",
  "market_label",
  "city",
  "state",
  "organization_id",
  "created_at",
  "vintage_year", // derived from deal.created_at (year)
  "ic_status",
  "status",
  "completed_at",
  "risk_index_score",
  "risk_index_version",
]);

const OPERATORS = new Set([
  "eq",
  "neq",
  "in",
  "gte",
  "lte",
  "exists",
  "and",
  "or",
  "not",
]);

function isCohortRule(value: unknown): value is CohortRule {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value as object);
  if (keys.length !== 1) return false;
  const op = keys[0];
  if (!OPERATORS.has(op)) return false;
  const arg = (value as Record<string, unknown>)[op];
  switch (op) {
    case "eq":
    case "neq":
      return Array.isArray(arg) && arg.length === 2 && typeof arg[0] === "string" && ALLOWED_FIELDS.has(arg[0]);
    case "in":
      return Array.isArray(arg) && arg.length === 2 && typeof arg[0] === "string" && ALLOWED_FIELDS.has(arg[0]) && Array.isArray(arg[1]);
    case "gte":
    case "lte":
      return Array.isArray(arg) && arg.length === 2 && typeof arg[0] === "string" && ALLOWED_FIELDS.has(arg[0]) && typeof arg[1] === "number";
    case "exists":
      return Array.isArray(arg) && arg.length === 1 && typeof arg[0] === "string" && ALLOWED_FIELDS.has(arg[0]);
    case "and":
    case "or":
      return Array.isArray(arg) && arg.every((r) => isCohortRule(r));
    case "not":
      return isCohortRule(arg);
    default:
      return false;
  }
}

/** Validate rule_json shape; returns null if invalid. */
export function validateRule(ruleJson: unknown): CohortRule | null {
  if (ruleJson === null || typeof ruleJson !== "object" || Array.isArray(ruleJson)) {
    return null;
  }
  const r = ruleJson as Record<string, unknown>;
  if (r.and !== undefined) {
    if (!Array.isArray(r.and) || !r.and.every((x) => isCohortRule(x))) return null;
    return { and: r.and as CohortRule[] };
  }
  if (r.or !== undefined) {
    if (!Array.isArray(r.or) || !r.or.every((x) => isCohortRule(x))) return null;
    return { or: r.or as CohortRule[] };
  }
  if (r.not !== undefined) {
    if (!isCohortRule(r.not)) return null;
    return { not: r.not as CohortRule };
  }
  if (r.eq !== undefined) {
    if (!Array.isArray(r.eq) || r.eq.length !== 2 || typeof r.eq[0] !== "string" || !ALLOWED_FIELDS.has(r.eq[0]))
      return null;
    return { eq: r.eq as [string, unknown] };
  }
  if (r.neq !== undefined) {
    if (!Array.isArray(r.neq) || r.neq.length !== 2 || typeof r.neq[0] !== "string" || !ALLOWED_FIELDS.has(r.neq[0]))
      return null;
    return { neq: r.neq as [string, unknown] };
  }
  if (r.in !== undefined) {
    if (!Array.isArray(r.in) || r.in.length !== 2 || typeof r.in[0] !== "string" || !ALLOWED_FIELDS.has(r.in[0]) || !Array.isArray(r.in[1]))
      return null;
    return { in: r.in as [string, unknown[]] };
  }
  if (r.gte !== undefined) {
    if (!Array.isArray(r.gte) || r.gte.length !== 2 || typeof r.gte[0] !== "string" || !ALLOWED_FIELDS.has(r.gte[0]) || typeof r.gte[1] !== "number")
      return null;
    return { gte: r.gte as [string, number] };
  }
  if (r.lte !== undefined) {
    if (!Array.isArray(r.lte) || r.lte.length !== 2 || typeof r.lte[0] !== "string" || !ALLOWED_FIELDS.has(r.lte[0]) || typeof r.lte[1] !== "number")
      return null;
    return { lte: r.lte as [string, number] };
  }
  if (r.exists !== undefined) {
    if (!Array.isArray(r.exists) || r.exists.length !== 1 || typeof r.exists[0] !== "string" || !ALLOWED_FIELDS.has(r.exists[0]))
      return null;
    return { exists: r.exists as [string] };
  }
  return null;
}

function getVal(ctx: CohortEvalContext, field: string): unknown {
  const v = ctx[field];
  if (v === undefined) return undefined;
  if (typeof v === "string") return v;
  if (typeof v === "number") return v;
  if (v instanceof Date) return v.toISOString();
  return v;
}

function eq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-12;
  return String(a) === String(b);
}

/** Evaluate a single rule against context. Missing field => undefined; exists checks for presence. */
export function evaluateRule(rule: CohortRule, ctx: CohortEvalContext): boolean {
  if ("eq" in rule) {
    const [field, expected] = rule.eq;
    const actual = getVal(ctx, field);
    return eq(actual, expected);
  }
  if ("neq" in rule) {
    const [field, expected] = rule.neq;
    const actual = getVal(ctx, field);
    return !eq(actual, expected);
  }
  if ("in" in rule) {
    const [field, arr] = rule.in;
    const actual = getVal(ctx, field);
    if (actual === undefined) return false;
    const strActual = String(actual);
    return arr.some((x) => strActual === String(x));
  }
  if ("gte" in rule) {
    const [field, threshold] = rule.gte;
    const actual = getVal(ctx, field);
    if (typeof actual !== "number") return false;
    return actual >= threshold;
  }
  if ("lte" in rule) {
    const [field, threshold] = rule.lte;
    const actual = getVal(ctx, field);
    if (typeof actual !== "number") return false;
    return actual <= threshold;
  }
  if ("exists" in rule) {
    const [field] = rule.exists;
    const actual = getVal(ctx, field);
    return actual !== undefined && actual !== null;
  }
  if ("and" in rule) {
    return rule.and.every((r) => evaluateRule(r, ctx));
  }
  if ("or" in rule) {
    return rule.or.some((r) => evaluateRule(r, ctx));
  }
  if ("not" in rule) {
    return !evaluateRule(rule.not, ctx);
  }
  return false;
}

/** Recursively sort object keys for deterministic JSON. */
function canonicalize(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(canonicalize);
  const o = obj as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    out[k] = canonicalize(o[k]);
  }
  return out;
}

/** Deterministic rule_hash = sha256(canonical_json(rule_json)). */
export function computeRuleHash(ruleJson: unknown): string {
  const canon = canonicalize(ruleJson);
  const str = JSON.stringify(canon);
  return createHash("sha256").update(str, "utf8").digest("hex");
}
