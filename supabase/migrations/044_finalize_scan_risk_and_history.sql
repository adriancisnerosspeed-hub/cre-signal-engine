-- PATCH 1: RPC to finalize scan risk and write history in one transaction.
-- Idempotent: INSERT risk_score_history with ON CONFLICT (scan_id) DO NOTHING so retry creates no duplicate.
-- Single completed_at used for both deal_scans and risk_score_history.

CREATE OR REPLACE FUNCTION public.finalize_scan_risk_and_history(
  p_scan_id uuid,
  p_deal_id uuid,
  p_score int,
  p_band text,
  p_completed_at timestamptz,
  p_breakdown jsonb DEFAULT NULL,
  p_version text DEFAULT NULL,
  p_macro_linked_count int DEFAULT NULL,
  p_percentile numeric DEFAULT NULL,
  p_snapshot_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1) UPDATE deal_scans with risk_index_* and completed_at (always runs)
  UPDATE deal_scans
  SET
    risk_index_score = p_score,
    risk_index_band = p_band,
    risk_index_breakdown = COALESCE(p_breakdown, risk_index_breakdown),
    risk_index_version = COALESCE(p_version, risk_index_version),
    macro_linked_count = COALESCE(p_macro_linked_count, macro_linked_count),
    completed_at = p_completed_at
  WHERE id = p_scan_id;

  -- 2) INSERT risk_score_history; ON CONFLICT DO NOTHING for idempotency on retry
  INSERT INTO risk_score_history (deal_id, scan_id, score, risk_band, completed_at, percentile, snapshot_id)
  VALUES (p_deal_id, p_scan_id, p_score, p_band, p_completed_at, p_percentile, p_snapshot_id)
  ON CONFLICT (scan_id) DO NOTHING;

  -- If conflict occurred (retry), no row inserted; no need to re-raise — deal_scans update already applied
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'finalize_scan_risk_and_history: risk_score_history insert failed (non-fatal): %', SQLERRM;
  -- Do not re-raise; scan result is already persisted in deal_scans
END;
$$;

COMMENT ON FUNCTION public.finalize_scan_risk_and_history(uuid,uuid,int,text,timestamptz,jsonb,text,int,numeric,uuid) IS
  'Finalize scan: update deal_scans risk_index_* and completed_at, insert risk_score_history. Idempotent on scan_id; history insert failure logged via NOTICE only.';

REVOKE EXECUTE ON FUNCTION public.finalize_scan_risk_and_history(uuid,uuid,int,text,timestamptz,jsonb,text,int,numeric,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_scan_risk_and_history(uuid,uuid,int,text,timestamptz,jsonb,text,int,numeric,uuid) TO service_role;
