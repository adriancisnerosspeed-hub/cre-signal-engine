-- Finalize RPC: return structured result { scan_updated, history_inserted } for logging.
-- If risk_score_history insert conflicts or fails, history_inserted=false but scan_updated=true.
-- Must DROP first because return type is changing (void -> TABLE); CREATE OR REPLACE cannot change return type.

DROP FUNCTION IF EXISTS public.finalize_scan_risk_and_history(uuid,uuid,int,text,timestamptz,jsonb,text,int,numeric,uuid);

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
RETURNS TABLE(scan_updated boolean, history_inserted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scan_updated boolean := true;
  v_history_inserted boolean := false;
  v_dummy_id uuid;
BEGIN
  -- 1) UPDATE deal_scans (always runs)
  UPDATE deal_scans
  SET
    risk_index_score = p_score,
    risk_index_band = p_band,
    risk_index_breakdown = COALESCE(p_breakdown, risk_index_breakdown),
    risk_index_version = COALESCE(p_version, risk_index_version),
    macro_linked_count = COALESCE(p_macro_linked_count, macro_linked_count),
    completed_at = p_completed_at
  WHERE id = p_scan_id;

  -- 2) INSERT risk_score_history; ON CONFLICT DO NOTHING; FOUND = true iff row inserted
  BEGIN
    INSERT INTO risk_score_history (deal_id, scan_id, score, risk_band, completed_at, percentile, snapshot_id)
    VALUES (p_deal_id, p_scan_id, p_score, p_band, p_completed_at, p_percentile, p_snapshot_id)
    ON CONFLICT (scan_id) DO NOTHING
    RETURNING id INTO v_dummy_id;
    v_history_inserted := FOUND;
  EXCEPTION
    WHEN OTHERS THEN
      v_history_inserted := false;
      RAISE NOTICE 'finalize_scan_risk_and_history: risk_score_history insert failed (non-fatal): %', SQLERRM;
  END;

  scan_updated := v_scan_updated;
  history_inserted := v_history_inserted;
  RETURN NEXT;
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.finalize_scan_risk_and_history(uuid,uuid,int,text,timestamptz,jsonb,text,int,numeric,uuid) IS
  'Finalize scan: update deal_scans, insert risk_score_history. Returns (scan_updated, history_inserted). Idempotent on scan_id.';

REVOKE EXECUTE ON FUNCTION public.finalize_scan_risk_and_history(uuid,uuid,int,text,timestamptz,jsonb,text,int,numeric,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_scan_risk_and_history(uuid,uuid,int,text,timestamptz,jsonb,text,int,numeric,uuid) TO service_role;
