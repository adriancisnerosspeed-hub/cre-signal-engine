-- PATCH 3: Accept invite in one transaction with member cap check to prevent race at maxMembers.
-- Lock org FOR UPDATE; count members; if at cap return MEMBER_LIMIT_REACHED + required_plan; else insert member and mark invite accepted.

CREATE OR REPLACE FUNCTION public.accept_organization_invite_with_cap(
  p_invite_id uuid,
  p_user_id uuid
)
RETURNS TABLE(ok boolean, code text, required_plan text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_invite_role text;
  v_plan text;
  v_max_members int;
  v_member_count bigint;
  v_required_plan text;
  v_workspace_role text;
BEGIN
  -- Get invite and ensure it exists (route validates token/email; we just need org_id and role)
  SELECT org_id, role INTO v_org_id, v_invite_role
  FROM organization_invites
  WHERE id = p_invite_id;

  IF v_org_id IS NULL THEN
    ok := false;
    code := 'INVITE_NOT_FOUND';
    required_plan := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Map invite role to workspace role (organization_members uses OWNER, ADMIN, MEMBER)
  v_workspace_role := CASE WHEN v_invite_role = 'admin' THEN 'ADMIN' ELSE 'MEMBER' END;

  -- 1) Lock organization row
  SELECT o.plan INTO v_plan
  FROM organizations o
  WHERE o.id = v_org_id
  FOR UPDATE;

  IF v_plan IS NULL THEN
    ok := false;
    code := 'ORGANIZATION_NOT_FOUND';
    required_plan := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- 2) Plan -> max members (FREE=1, PRO=5, PRO+=10, ENTERPRISE=unlimited)
  v_max_members := CASE
    WHEN v_plan = 'FREE' THEN 1
    WHEN v_plan = 'PRO' THEN 5
    WHEN v_plan = 'PRO+' THEN 10
    ELSE NULL
  END;

  -- 3) Count current members
  SELECT count(*) INTO v_member_count
  FROM organization_members
  WHERE org_id = v_org_id;

  -- 4) At cap?
  IF v_max_members IS NOT NULL AND v_member_count >= v_max_members THEN
    v_required_plan := CASE
      WHEN v_plan = 'PRO' THEN 'PRO+'
      WHEN v_plan = 'PRO+' THEN 'ENTERPRISE'
      ELSE 'ENTERPRISE'
    END;
    ok := false;
    code := 'MEMBER_LIMIT_REACHED';
    required_plan := v_required_plan;
    RETURN NEXT;
    RETURN;
  END IF;

  -- 5) Insert membership (ignore duplicate if already member, e.g. idempotent accept)
  INSERT INTO organization_members (org_id, user_id, role)
  VALUES (v_org_id, p_user_id, v_workspace_role)
  ON CONFLICT (org_id, user_id) DO NOTHING;

  -- 6) Mark invite accepted
  UPDATE organization_invites
  SET status = 'accepted', accepted_at = now()
  WHERE id = p_invite_id AND status IN ('pending', 'sent');

  ok := true;
  code := NULL;
  required_plan := NULL;
  RETURN NEXT;
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.accept_organization_invite_with_cap(uuid, uuid) IS
  'Accept invite atomically: lock org, enforce member cap, insert member, mark invite accepted. Returns (ok, code, required_plan); code=MEMBER_LIMIT_REACHED when at cap.';

REVOKE EXECUTE ON FUNCTION public.accept_organization_invite_with_cap(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_organization_invite_with_cap(uuid, uuid) TO service_role;
