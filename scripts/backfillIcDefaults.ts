/**
 * One-time backfill: set deals.ic_status to 'PRE_IC' where NULL.
 * Run with --dry-run to print counts only; use --commit to apply.
 *
 * Usage: npx tsx scripts/backfillIcDefaults.ts [--dry-run | --commit]
 */

import { createServiceRoleClient } from "../lib/supabase/service";

async function main() {
  const hasDryRun = process.argv.includes("--dry-run");
  const hasCommit = process.argv.includes("--commit");
  if (!hasDryRun && !hasCommit) {
    console.error("Use --dry-run to see counts only, or --commit to apply updates.");
    process.exit(1);
  }
  const dryRun = hasDryRun || !hasCommit;

  const service = createServiceRoleClient();

  const { count: totalNull, error: countError } = await service
    .from("deals")
    .select("*", { count: "exact", head: true })
    .is("ic_status", null);

  if (countError) {
    console.error("Count error:", countError);
    process.exit(1);
  }

  console.log(`Deals with ic_status NULL: ${totalNull ?? 0}`);

  if (dryRun) {
    console.log("Dry run: no updates applied. Run with --commit to set ic_status = 'PRE_IC'.");
    return;
  }

  if ((totalNull ?? 0) === 0) {
    console.log("Nothing to update.");
    return;
  }

  const { error: updateError } = await service
    .from("deals")
    .update({ ic_status: "PRE_IC" })
    .is("ic_status", null);

  if (updateError) {
    console.error("Update error:", updateError);
    process.exit(1);
  }

  console.log(`Updated ${totalNull} deal(s) to ic_status = 'PRE_IC'.`);
}

main();
