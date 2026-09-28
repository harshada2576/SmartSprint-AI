-- =============================================================================
-- Migration: 0006_hr_member_removal
-- Description: Allow HR to remove organization members (Matrix: Remove
--              members = ADMIN + HR). The last-ADMIN trigger from 0002
--              still blocks lockout for every lane.
-- =============================================================================

DROP POLICY IF EXISTS organization_members_hr_delete ON public.organization_members;
CREATE POLICY organization_members_hr_delete ON public.organization_members
  FOR DELETE USING (
    public.smartsprint_is_hr(organization_id)
    AND user_id <> auth.uid()
  );
-- HR cannot remove itself through this path (self-removal is denied); ADMIN
-- removal of members continues via organization_members_admin_delete.
