/**
 * One-time backfill: insert risk_audit_log rows for historical completed scans.
 * Previous score is computed deterministically by (created_at DESC, id DESC) per deal.
 * Skips scan_id already present (UNIQUE). Use --dry-run for counts only.
 *
 * Usage: npx tsx scripts/backfillRiskAuditLog.ts [--dry-run | --commit]
 */

import { createServiceRoleClient } from "../lib/supabase/service";
import { RISK_INDEX_VERSION } from "../lib/riskIndex";
import { buildAuditRows, type ScanRowForAudit } from "../lib/backfillRiskAuditLog";

async function main() {
  const hasDryRun = process.argv.includes("--dry-run");
  const hasCommit = process.argv.includes("--commit");
  if (!hasDryRun && !hasCommit) {
    console.error("Use --dry-run to see counts only, or --commit to perform inserts.");
    process.exit(1);
  }
  const dryRun = hasDryRun || !hasCommit;

  const service = createServiceRoleClient();

  const { data: scans, error: scansError } = await service
    .from("deal_scans")
    .select("id, deal_id, risk_index_score, risk_index_band, risk_index_version, created_at")
    .eq("status", "completed")
    .not("risk_index_score", "is", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (scansError) {
    console.error("Fetch scans error:", scansError);
    process.exit(1);
  }

  const scanList = (scans ?? []) as ScanRowForAudit[];

  const { data: existingRows, error: existingError } = await service
    .from("risk_audit_log")
    .select("scan_id");

  if (existingError) {
    console.error("Fetch existing audit log error:", existingError);
    process.exit(1);
  }

  const existingScanIds = new Set((existingRows ?? []).map((r: { scan_id: string }) => r.scan_id));

  const byDeal = new Map<string, ScanRowForAudit[]>();
  for (const s of scanList) {
    const list = byDeal.get(s.deal_id) ?? [];
    list.push(s);
    byDeal.set(s.deal_id, list);
  }

  const toInsert = buildAuditRows(byDeal, existingScanIds, RISK_INDEX_VERSION);

  console.log(`Completed scans with score: ${scanList.length}`);
  console.log(`Already in risk_audit_log: ${existingScanIds.size}`);
  console.log(`Rows to insert: ${toInsert.length}`);

  if (dryRun) {
    console.log("Dry run: no inserts. Run with --commit to apply.");
    return;
  }

  if (toInsert.length === 0) {
    console.log("Nothing to insert.");
    return;
  }

  let inserted = 0;
  let skipped = 0;
  const BATCH = 100;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    const { error } = await service.from("risk_audit_log").insert(batch);
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        for (const row of batch) {
          const { error: oneErr } = await service.from("risk_audit_log").insert(row);
          if (oneErr && (oneErr as { code?: string }).code === "23505") skipped++;
          else if (!oneErr) inserted++;
        }
      } else {
        console.error("Insert error:", error);
        process.exit(1);
      }
    } else {
      inserted += batch.length;
    }
  }

  console.log(`Inserted: ${inserted}. Skipped (already present): ${skipped}.`);
}

main();
