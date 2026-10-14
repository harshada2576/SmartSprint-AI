-- =============================================================================
-- Migration: 0009_approval_decision_reason
-- Description: Persist the decision rationale on approvals. Approval
--              decisions previously stored only status/decided_by/decided_at,
--              leaving no room for the reviewer rationale the governance
--              workflow requires. Additive nullable column: safe for existing
--              rows, no RLS changes (approvals policies are unaffected).
-- =============================================================================

ALTER TABLE public.approvals
ADD COLUMN IF NOT EXISTS decided_reason text;
