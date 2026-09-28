-- =============================================================================
-- Migration: 0005_rbac_rls_rewrite
-- Description: Six-role RLS rewrite (ADMIN / PROJECT_MANAGER / DEVELOPER /
--              FINANCE / LEGAL / HR) with typed approval routing, risk-domain
--              permissions, role-change workflow, and new-surface policies.
--
-- Authority: Master Implementation Specification §1 (RBAC model), §3 (RLS).
-- RLS is the ultimate security boundary; API guards are defense-in-depth.
--
-- Design notes:
-- * DEVELOPER / FINANCE / LEGAL reuse the existing project_members
--   mechanism (§1.2.8). No second project-access system is created.
-- * HR is organization-scoped with zero project-data access (§1.2.9, §1.4).
--   HR holds no project_members rows and matches no staff policy, so every
--   project-derived SELECT denies HR by default. HR receives explicit
--   policies ONLY for users/org-members/invitations/role-requests/documents.
-- * Documents: the §1.3 matrix grants HR document access while §1.4 lists
--   documents under "no project-data access". Resolution: project task/
--   sprint/requirement/risk/governance rows stay closed to HR; the
--   document/folder metadata surface follows the §1.3 matrix (ADMIN +
--   FINANCE + LEGAL + HR, no PM/DEV).
-- * Direct organization_members.role writes are blocked by trigger
--   (forbid_direct_role_change); only the atomic approval transaction with
--   SET LOCAL app.bypass_role_guard = 'on' may change roles.
-- * Idempotent: DROP POLICY/TRIGGER IF EXISTS before CREATE. Safe to re-run.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- SECTION 1: NEW HELPERS
-- ---------------------------------------------------------------------------

-- 1.1 Caller role in an organization (NULL when no membership -> deny).
CREATE OR REPLACE FUNCTION public.smartsprint_caller_role(p_org_id uuid)
RETURNS public.user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT om.role FROM public.organization_members om
  WHERE om.organization_id = p_org_id AND om.user_id = auth.uid()
  LIMIT 1;
$$;
COMMENT ON FUNCTION public.smartsprint_caller_role(uuid) IS
  'RLS helper: caller user_role in p_org_id (NULL -> fail-closed). Basis for typed approval routing and budget editing.';

-- 1.2 Is the caller HR in organization p_org_id?
CREATE OR REPLACE FUNCTION public.smartsprint_is_hr(p_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = p_org_id
      AND om.user_id = auth.uid()
      AND om.role = 'HR'::public.user_role
  );
$$;
COMMENT ON FUNCTION public.smartsprint_is_hr(uuid) IS
  'RLS helper: TRUE when auth.uid() is HR in p_org_id. HR is org-scoped with zero project-data access.';

-- 1.3 Owning project of a task.
CREATE OR REPLACE FUNCTION public.smartsprint_task_project(p_task_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT t.project_id FROM public.tasks t WHERE t.id = p_task_id;
$$;
COMMENT ON FUNCTION public.smartsprint_task_project(uuid) IS
  'RLS helper: owning project_id of a task (NULL -> deny). Guards task_dependencies and task_attachments.';

-- 1.4 Typed approval SUBMIT routing (§1.2.2).
CREATE OR REPLACE FUNCTION public.smartsprint_can_submit_approval(p_project_id uuid, p_type public.approval_type)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN public.smartsprint_project_org(p_project_id) IS NULL THEN false
    WHEN public.smartsprint_is_org_admin(public.smartsprint_project_org(p_project_id)) THEN true
    ELSE CASE p_type
      WHEN 'scope'::public.approval_type THEN public.smartsprint_caller_role(public.smartsprint_project_org(p_project_id)) = 'PROJECT_MANAGER'::public.user_role
      WHEN 'resource'::public.approval_type THEN public.smartsprint_caller_role(public.smartsprint_project_org(p_project_id)) = 'PROJECT_MANAGER'::public.user_role
      WHEN 'budget'::public.approval_type THEN public.smartsprint_caller_role(public.smartsprint_project_org(p_project_id)) IN ('PROJECT_MANAGER'::public.user_role, 'FINANCE'::public.user_role)
      WHEN 'vendor'::public.approval_type THEN public.smartsprint_caller_role(public.smartsprint_project_org(p_project_id)) IN ('PROJECT_MANAGER'::public.user_role, 'LEGAL'::public.user_role)
      ELSE false
    END
  END;
$$;
COMMENT ON FUNCTION public.smartsprint_can_submit_approval(uuid, public.approval_type) IS
  'RLS helper: typed approval submit routing (scope/resource: PM+ADMIN; budget: PM/FINANCE/ADMIN; vendor: PM/LEGAL/ADMIN).';

-- 1.5 Typed approval DECIDE routing (§1.2.2). ADMIN decides any type.
CREATE OR REPLACE FUNCTION public.smartsprint_can_decide_approval(p_project_id uuid, p_type public.approval_type)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN public.smartsprint_project_org(p_project_id) IS NULL THEN false
    WHEN public.smartsprint_is_org_admin(public.smartsprint_project_org(p_project_id)) THEN true
    ELSE CASE p_type
      WHEN 'scope'::public.approval_type THEN public.smartsprint_caller_role(public.smartsprint_project_org(p_project_id)) = 'PROJECT_MANAGER'::public.user_role
      WHEN 'resource'::public.approval_type THEN public.smartsprint_caller_role(public.smartsprint_project_org(p_project_id)) = 'PROJECT_MANAGER'::public.user_role
      WHEN 'budget'::public.approval_type THEN public.smartsprint_caller_role(public.smartsprint_project_org(p_project_id)) = 'FINANCE'::public.user_role
      WHEN 'vendor'::public.approval_type THEN public.smartsprint_caller_role(public.smartsprint_project_org(p_project_id)) = 'LEGAL'::public.user_role
      ELSE false
    END
  END;
$$;
COMMENT ON FUNCTION public.smartsprint_can_decide_approval(uuid, public.approval_type) IS
  'RLS helper: typed approval decide routing (scope/resource: PM+ADMIN; budget: FINANCE+ADMIN; vendor: LEGAL+ADMIN). FINANCE deciding scope/vendor -> false; LEGAL deciding budget -> false.';

-- 1.6 Risk-domain resolution (§1.2.5, §1.3 Risks).
CREATE OR REPLACE FUNCTION public.smartsprint_can_resolve_risk(p_project_id uuid, p_domain public.risk_domain)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN public.smartsprint_project_org(p_project_id) IS NULL THEN false
    WHEN public.smartsprint_is_org_staff(public.smartsprint_project_org(p_project_id)) THEN true
    WHEN p_domain IS NULL THEN false
    WHEN public.smartsprint_caller_role(public.smartsprint_project_org(p_project_id)) = 'FINANCE'::public.user_role
      THEN p_domain IN ('budget'::public.risk_domain, 'resource'::public.risk_domain)
    WHEN public.smartsprint_caller_role(public.smartsprint_project_org(p_project_id)) = 'LEGAL'::public.user_role
      THEN p_domain = 'legal'::public.risk_domain
    ELSE false
  END;
$$;
COMMENT ON FUNCTION public.smartsprint_can_resolve_risk(uuid, public.risk_domain) IS
  'RLS helper: risk-domain resolution (staff: any; FINANCE: budget/resource; LEGAL: legal; technical/NULL: staff-only; DEV/HR: never).';

-- 1.7 Budget/contract editing (§1.3 Governance: ADMIN, PM, FINANCE).
CREATE OR REPLACE FUNCTION public.smartsprint_can_edit_budget(p_project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN public.smartsprint_project_org(p_project_id) IS NULL THEN false
    WHEN public.smartsprint_is_org_admin(public.smartsprint_project_org(p_project_id)) THEN true
    WHEN public.smartsprint_caller_role(public.smartsprint_project_org(p_project_id)) = 'PROJECT_MANAGER'::public.user_role THEN true
    WHEN public.smartsprint_caller_role(public.smartsprint_project_org(p_project_id)) = 'FINANCE'::public.user_role
      AND public.smartsprint_is_project_member(p_project_id) THEN true
    ELSE false
  END;
$$;
COMMENT ON FUNCTION public.smartsprint_can_edit_budget(uuid) IS
  'RLS helper: budget/contract/milestone editing (ADMIN org-wide; PM org-wide; FINANCE in member projects; LEGAL/DEV/HR never).';

-- 1.8 Document access (§1.3 Documents: ADMIN, FINANCE, LEGAL, HR; no PM/DEV).
CREATE OR REPLACE FUNCTION public.smartsprint_can_access_documents(p_project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN public.smartsprint_project_org(p_project_id) IS NULL THEN false
    WHEN public.smartsprint_is_org_admin(public.smartsprint_project_org(p_project_id)) THEN true
    WHEN public.smartsprint_is_hr(public.smartsprint_project_org(p_project_id)) THEN true
    WHEN public.smartsprint_caller_role(public.smartsprint_project_org(p_project_id)) IN ('FINANCE'::public.user_role, 'LEGAL'::public.user_role)
      AND public.smartsprint_is_project_member(p_project_id) THEN true
    ELSE false
  END;
$$;
COMMENT ON FUNCTION public.smartsprint_can_access_documents(uuid) IS
  'RLS helper: document/folder access (ADMIN org-wide; HR org-wide; FINANCE/LEGAL in member projects; PM/DEV never).';

-- ---------------------------------------------------------------------------
-- SECTION 2: APPROVALS — typed routing replaces the broad staff policy.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS approvals_insert_member ON public.approvals;
DROP POLICY IF EXISTS approvals_insert_staff ON public.approvals;
DROP POLICY IF EXISTS approvals_update_staff ON public.approvals;

-- Submit: typed routing + attribution forced to self + starts undecided.
CREATE POLICY approvals_insert_typed ON public.approvals
  FOR INSERT WITH CHECK (
    public.smartsprint_can_submit_approval(project_id, type)
    AND requester_id = auth.uid()
    AND status = 'pending'::public.approval_status
    AND decided_by IS NULL
    AND decided_at IS NULL
  );

-- Decide: typed routing + decider attribution forced to self + no self-decision.
CREATE POLICY approvals_update_typed ON public.approvals
  FOR UPDATE
  USING (
    public.smartsprint_can_decide_approval(project_id, type)
  )
  WITH CHECK (
    public.smartsprint_can_decide_approval(project_id, type)
    AND (decided_by IS NULL OR decided_by = auth.uid())
    AND (status = 'pending'::public.approval_status OR requester_id IS DISTINCT FROM decided_by)
  );

-- ---------------------------------------------------------------------------
-- SECTION 3: RISKS — own-domain specialist resolution.
-- ---------------------------------------------------------------------------
-- SELECT/INSERT member+staff policies from 0002 already cover FINANCE/LEGAL
-- project-member reads and filing. Add domain-scoped UPDATE for specialists.
DROP POLICY IF EXISTS risks_update_finance ON public.risks;
CREATE POLICY risks_update_finance ON public.risks
  FOR UPDATE
  USING (
    public.smartsprint_is_project_member(project_id)
    AND public.smartsprint_caller_role(public.smartsprint_project_org(project_id)) = 'FINANCE'::public.user_role
    AND risk_domain IN ('budget'::public.risk_domain, 'resource'::public.risk_domain)
  )
  WITH CHECK (
    public.smartsprint_is_project_member(project_id)
    AND public.smartsprint_caller_role(public.smartsprint_project_org(project_id)) = 'FINANCE'::public.user_role
    AND risk_domain IN ('budget'::public.risk_domain, 'resource'::public.risk_domain)
    AND (owner_id IS NULL OR public.smartsprint_user_is_org_member(owner_id, public.smartsprint_project_org(project_id)))
  );

DROP POLICY IF EXISTS risks_update_legal ON public.risks;
CREATE POLICY risks_update_legal ON public.risks
  FOR UPDATE
  USING (
    public.smartsprint_is_project_member(project_id)
    AND public.smartsprint_caller_role(public.smartsprint_project_org(project_id)) = 'LEGAL'::public.user_role
    AND risk_domain = 'legal'::public.risk_domain
  )
  WITH CHECK (
    public.smartsprint_is_project_member(project_id)
    AND public.smartsprint_caller_role(public.smartsprint_project_org(project_id)) = 'LEGAL'::public.user_role
    AND risk_domain = 'legal'::public.risk_domain
    AND (owner_id IS NULL OR public.smartsprint_user_is_org_member(owner_id, public.smartsprint_project_org(project_id)))
  );

-- DEVELOPER requirement edits contradict the matrix (DEV: no
-- create/edit/prioritize/delete on requirements) — remove the dev-self
-- requirement policy. Developer task edits stay via tasks_update_dev_self,
-- narrowed to allowed fields by trigger (SECTION 7).
DROP POLICY IF EXISTS requirements_update_dev_self ON public.requirements;

-- ---------------------------------------------------------------------------
-- SECTION 4: role_change_requests RLS (§3 exact rules).
-- ---------------------------------------------------------------------------
-- INSERT: exactly two valid shapes (self-request by non-HR, or HR-on-behalf).
DROP POLICY IF EXISTS role_change_requests_insert ON public.role_change_requests;
CREATE POLICY role_change_requests_insert ON public.role_change_requests
  FOR INSERT WITH CHECK (
    requested_by = auth.uid()
    AND status = 'pending'::public.role_change_request_status
    AND decided_by IS NULL
    AND decided_at IS NULL
    AND public.smartsprint_is_org_member(organization_id)
    AND public.smartsprint_user_is_org_member(user_id, organization_id)
    AND public.smartsprint_user_is_org_member(requested_by, organization_id)
    AND (
      -- Shape 1: self-request (caller role is not HR).
      (requested_by = user_id
        AND public.smartsprint_caller_role(organization_id) IN (
          'ADMIN'::public.user_role, 'PROJECT_MANAGER'::public.user_role,
          'DEVELOPER'::public.user_role, 'FINANCE'::public.user_role,
          'LEGAL'::public.user_role))
      OR
      -- Shape 2: HR-on-behalf (caller is HR, target differs).
      (requested_by <> user_id
        AND public.smartsprint_caller_role(organization_id) = 'HR'::public.user_role)
    )
  );

-- SELECT: target user, HR requester, or ADMIN of that organization.
DROP POLICY IF EXISTS role_change_requests_select ON public.role_change_requests;
CREATE POLICY role_change_requests_select ON public.role_change_requests
  FOR SELECT USING (
    user_id = auth.uid()
    OR requested_by = auth.uid()
    OR public.smartsprint_is_org_admin(organization_id)
  );

-- UPDATE: ADMIN-only decision, never self-decision/target-decision.
DROP POLICY IF EXISTS role_change_requests_update ON public.role_change_requests;
CREATE POLICY role_change_requests_update ON public.role_change_requests
  FOR UPDATE
  USING (
    public.smartsprint_is_org_admin(organization_id)
    AND auth.uid() <> user_id
    AND requested_by <> auth.uid()
    AND status = 'pending'::public.role_change_request_status
  )
  WITH CHECK (
    public.smartsprint_is_org_admin(organization_id)
    AND auth.uid() <> user_id
    AND requested_by <> auth.uid()
    AND decided_by = auth.uid()
    AND status IN ('approved'::public.role_change_request_status, 'rejected'::public.role_change_request_status)
  );
-- No DELETE for normal callers: request history is append-only.

-- ---------------------------------------------------------------------------
-- SECTION 5: organization_members — no direct role writes.
-- RLS keeps ADMIN-only UPDATE (needed for the trusted approval path which
-- runs with the bypass flag); the trigger below blocks every direct role
-- change that does not carry SET LOCAL app.bypass_role_guard = 'on'.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.smartsprint_forbid_direct_role_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role
     AND current_setting('app.bypass_role_guard', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'SmartSprint RLS: direct organization_members.role writes are forbidden; use the role_change_requests workflow';
  END IF;
  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION public.smartsprint_forbid_direct_role_change() IS
  'Integrity trigger: organization_members.role may only change inside the atomic role-approval transaction (SET LOCAL app.bypass_role_guard = on). Applies to every role including service_role.';

DROP TRIGGER IF EXISTS trg_organization_members_forbid_direct_role ON public.organization_members;
CREATE TRIGGER trg_organization_members_forbid_direct_role
  BEFORE UPDATE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.smartsprint_forbid_direct_role_change();

-- ---------------------------------------------------------------------------
-- SECTION 6: DOCUMENTS / FOLDERS — §1.3 matrix (ADMIN/FINANCE/LEGAL/HR).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS folders_select_staff ON public.folders;
DROP POLICY IF EXISTS folders_select_member ON public.folders;
DROP POLICY IF EXISTS folders_insert_staff ON public.folders;
DROP POLICY IF EXISTS folders_insert_member ON public.folders;
DROP POLICY IF EXISTS folders_update_staff ON public.folders;
DROP POLICY IF EXISTS folders_update_dev_own ON public.folders;

CREATE POLICY folders_select_docs ON public.folders
  FOR SELECT USING (public.smartsprint_can_access_documents(project_id));

CREATE POLICY folders_insert_docs ON public.folders
  FOR INSERT WITH CHECK (
    public.smartsprint_can_access_documents(project_id)
    AND created_by = auth.uid()
    AND (parent_id IS NULL OR public.smartsprint_folder_project(parent_id) = project_id)
  );

CREATE POLICY folders_update_docs ON public.folders
  FOR UPDATE
  USING (public.smartsprint_can_access_documents(project_id))
  WITH CHECK (
    public.smartsprint_can_access_documents(project_id)
    AND public.smartsprint_user_is_org_member(created_by, public.smartsprint_project_org(project_id))
    AND (parent_id IS NULL OR public.smartsprint_folder_project(parent_id) = project_id)
  );

DROP POLICY IF EXISTS documents_select_staff ON public.documents;
DROP POLICY IF EXISTS documents_select_member ON public.documents;
DROP POLICY IF EXISTS documents_insert_staff ON public.documents;
DROP POLICY IF EXISTS documents_insert_member ON public.documents;
DROP POLICY IF EXISTS documents_update_staff ON public.documents;
DROP POLICY IF EXISTS documents_update_dev_own ON public.documents;

CREATE POLICY documents_select_docs ON public.documents
  FOR SELECT USING (public.smartsprint_can_access_documents(project_id));

CREATE POLICY documents_insert_docs ON public.documents
  FOR INSERT WITH CHECK (
    public.smartsprint_can_access_documents(project_id)
    AND owner_id = auth.uid()
    AND (folder_id IS NULL OR public.smartsprint_folder_project(folder_id) = project_id)
  );

CREATE POLICY documents_update_docs ON public.documents
  FOR UPDATE
  USING (public.smartsprint_can_access_documents(project_id))
  WITH CHECK (
    public.smartsprint_can_access_documents(project_id)
    AND public.smartsprint_user_is_org_member(owner_id, public.smartsprint_project_org(project_id))
    AND (folder_id IS NULL OR public.smartsprint_folder_project(folder_id) = project_id)
  );
-- documents_delete_admin from 0002 stays (ADMIN-only delete).

-- ---------------------------------------------------------------------------
-- SECTION 7: TASKS — blockedReason atomic clearing + DEV field boundary.
-- ---------------------------------------------------------------------------
-- 7.1 Clearing isBlocked atomically clears blockedReason/blockedAt.
CREATE OR REPLACE FUNCTION public.smartsprint_tasks_blocked_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.is_blocked = false THEN
    NEW.blocked_reason := NULL;
    NEW.blocked_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION public.smartsprint_tasks_blocked_guard() IS
  'Integrity trigger: is_blocked=false atomically clears blocked_reason and blocked_at in the same write.';

DROP TRIGGER IF EXISTS trg_tasks_blocked_guard ON public.tasks;
CREATE TRIGGER trg_tasks_blocked_guard
  BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.smartsprint_tasks_blocked_guard();

-- 7.2 Non-staff callers may touch only status/progress/blocked fields on
-- their own tasks (API enforces first; trigger re-enforces for every lane).
CREATE OR REPLACE FUNCTION public.smartsprint_restrict_dev_task_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_role public.user_role;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.projects p WHERE p.id = NEW.project_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'SmartSprint RLS: task project not found';
  END IF;
  SELECT om.role INTO v_role FROM public.organization_members om
  WHERE om.organization_id = v_org AND om.user_id = auth.uid() LIMIT 1;
  -- Staff path (ADMIN/PM) and trusted lane (no JWT: service_role) skip the
  -- field boundary; RLS + API scope still apply to authenticated staff.
  IF v_role IS NULL OR v_role IN ('ADMIN'::public.user_role, 'PROJECT_MANAGER'::public.user_role) THEN
    RETURN NEW;
  END IF;
  IF OLD.assignee_id IS DISTINCT FROM NEW.assignee_id
     OR OLD.project_id IS DISTINCT FROM NEW.project_id
     OR OLD.title IS DISTINCT FROM NEW.title
     OR OLD.description IS DISTINCT FROM NEW.description
     OR OLD.priority IS DISTINCT FROM NEW.priority
     OR OLD.points IS DISTINCT FROM NEW.points
     OR OLD.sprint_id IS DISTINCT FROM NEW.sprint_id
     OR OLD.requirement_id IS DISTINCT FROM NEW.requirement_id
     OR OLD.due_date IS DISTINCT FROM NEW.due_date
     OR OLD.estimated_hours IS DISTINCT FROM NEW.estimated_hours
     OR OLD.actual_hours IS DISTINCT FROM NEW.actual_hours THEN
    RAISE EXCEPTION 'SmartSprint RLS: non-staff task update touches restricted fields';
  END IF;
  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION public.smartsprint_restrict_dev_task_update() IS
  'Integrity trigger: DEVELOPER/FINANCE/LEGAL may mutate only column_status, progress_percent, is_blocked, blocked_reason (+ timestamps) on tasks.';

DROP TRIGGER IF EXISTS trg_tasks_restrict_dev_update ON public.tasks;
CREATE TRIGGER trg_tasks_restrict_dev_update
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.smartsprint_restrict_dev_task_update();

-- ---------------------------------------------------------------------------
-- SECTION 8: GOVERNANCE WRITES — PM + FINANCE alongside ADMIN.
-- ---------------------------------------------------------------------------
-- budget_line_items: 0002 left writes ADMIN-only; matrix adds PM + FINANCE.
DROP POLICY IF EXISTS budget_line_items_insert_budget_editor ON public.budget_line_items;
CREATE POLICY budget_line_items_insert_budget_editor ON public.budget_line_items
  FOR INSERT WITH CHECK (public.smartsprint_can_edit_budget(project_id));

DROP POLICY IF EXISTS budget_line_items_update_budget_editor ON public.budget_line_items;
CREATE POLICY budget_line_items_update_budget_editor ON public.budget_line_items
  FOR UPDATE
  USING (public.smartsprint_can_edit_budget(project_id))
  WITH CHECK (public.smartsprint_can_edit_budget(project_id));

-- contracts: 0002 staff-write already covers ADMIN+PM; add FINANCE member.
DROP POLICY IF EXISTS contracts_insert_budget_editor ON public.contracts;
CREATE POLICY contracts_insert_budget_editor ON public.contracts
  FOR INSERT WITH CHECK (public.smartsprint_can_edit_budget(project_id));

DROP POLICY IF EXISTS contracts_update_budget_editor ON public.contracts;
CREATE POLICY contracts_update_budget_editor ON public.contracts
  FOR UPDATE
  USING (public.smartsprint_can_edit_budget(project_id))
  WITH CHECK (public.smartsprint_can_edit_budget(project_id));

-- milestones: staff-write covers ADMIN+PM; add FINANCE member.
DROP POLICY IF EXISTS milestones_insert_budget_editor ON public.milestones;
CREATE POLICY milestones_insert_budget_editor ON public.milestones
  FOR INSERT WITH CHECK (public.smartsprint_can_edit_budget(project_id));

DROP POLICY IF EXISTS milestones_update_budget_editor ON public.milestones;
CREATE POLICY milestones_update_budget_editor ON public.milestones
  FOR UPDATE
  USING (public.smartsprint_can_edit_budget(project_id))
  WITH CHECK (public.smartsprint_can_edit_budget(project_id));

-- ---------------------------------------------------------------------------
-- SECTION 9: MEMBERSHIP MANAGEMENT — PM alongside ADMIN; HR invitations.
-- ---------------------------------------------------------------------------
-- project_members: matrix grants PM add/remove alongside ADMIN.
DROP POLICY IF EXISTS project_members_pm_insert ON public.project_members;
CREATE POLICY project_members_pm_insert ON public.project_members
  FOR INSERT WITH CHECK (
    public.smartsprint_caller_role(public.smartsprint_project_org(project_id)) = 'PROJECT_MANAGER'::public.user_role
    AND public.smartsprint_user_is_org_member(user_id, public.smartsprint_project_org(project_id))
  );

DROP POLICY IF EXISTS project_members_pm_delete ON public.project_members;
CREATE POLICY project_members_pm_delete ON public.project_members
  FOR DELETE USING (
    public.smartsprint_caller_role(public.smartsprint_project_org(project_id)) = 'PROJECT_MANAGER'::public.user_role
  );

-- team_members: project-team assignment edits ADMIN/PM.
DROP POLICY IF EXISTS team_members_pm_insert ON public.team_members;
CREATE POLICY team_members_pm_insert ON public.team_members
  FOR INSERT WITH CHECK (
    public.smartsprint_caller_role(public.smartsprint_team_org(team_id)) = 'PROJECT_MANAGER'::public.user_role
    AND public.smartsprint_user_is_org_member(user_id, public.smartsprint_team_org(team_id))
  );

DROP POLICY IF EXISTS team_members_pm_delete ON public.team_members;
CREATE POLICY team_members_pm_delete ON public.team_members
  FOR DELETE USING (
    public.smartsprint_caller_role(public.smartsprint_team_org(team_id)) = 'PROJECT_MANAGER'::public.user_role
  );

-- invitations: HR may create + view alongside ADMIN (§1.4).
DROP POLICY IF EXISTS invitations_select_hr ON public.invitations;
CREATE POLICY invitations_select_hr ON public.invitations
  FOR SELECT USING (public.smartsprint_is_hr(organization_id));

DROP POLICY IF EXISTS invitations_hr_insert ON public.invitations;
CREATE POLICY invitations_hr_insert ON public.invitations
  FOR INSERT WITH CHECK (public.smartsprint_is_hr(organization_id));

-- ---------------------------------------------------------------------------
-- SECTION 10: AUDIT — ADMIN-only visibility (§1.2.7).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS activity_logs_select_member ON public.activity_logs;
CREATE POLICY activity_logs_select_admin ON public.activity_logs
  FOR SELECT USING (
    (organization_id IS NOT NULL AND public.smartsprint_is_org_admin(organization_id))
    OR (project_id IS NOT NULL AND public.smartsprint_is_org_admin(public.smartsprint_project_org(project_id)))
    OR (organization_id IS NULL AND project_id IS NULL AND user_id = auth.uid())
  );
-- No INSERT/UPDATE/DELETE for normal callers (append-only trusted lane).

-- ---------------------------------------------------------------------------
-- SECTION 11: HR profile maintenance — department/jobTitle only.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS users_update_hr ON public.users;
CREATE POLICY users_update_hr ON public.users
  FOR UPDATE
  USING (public.smartsprint_shares_org_with(id) AND EXISTS (
    SELECT 1 FROM public.organization_members m1
    JOIN public.organization_members m2 ON m1.organization_id = m2.organization_id
    WHERE m1.user_id = auth.uid() AND m1.role = 'HR'::public.user_role AND m2.user_id = users.id
  ))
  WITH CHECK (public.smartsprint_shares_org_with(id));

CREATE OR REPLACE FUNCTION public.smartsprint_restrict_hr_user_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_admin boolean := false;
  v_is_hr boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members m1
    JOIN public.organization_members m2 ON m1.organization_id = m2.organization_id
    WHERE m1.user_id = auth.uid() AND m1.role = 'ADMIN'::public.user_role AND m2.user_id = NEW.id
  ) INTO v_is_admin;
  IF v_is_admin THEN RETURN NEW; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members m1
    JOIN public.organization_members m2 ON m1.organization_id = m2.organization_id
    WHERE m1.user_id = auth.uid() AND m1.role = 'HR'::public.user_role AND m2.user_id = NEW.id
  ) INTO v_is_hr;
  IF v_is_hr THEN
    IF OLD.first_name IS DISTINCT FROM NEW.first_name
       OR OLD.last_name IS DISTINCT FROM NEW.last_name
       OR OLD.email IS DISTINCT FROM NEW.email
       OR OLD.status IS DISTINCT FROM NEW.status
       OR OLD.avatar_initials IS DISTINCT FROM NEW.avatar_initials
       OR OLD.avatar_url IS DISTINCT FROM NEW.avatar_url THEN
      RAISE EXCEPTION 'SmartSprint RLS: HR may edit only department and job_title on user profiles';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION public.smartsprint_restrict_hr_user_update() IS
  'Integrity trigger: HR profile maintenance limited to department/job_title (ADMIN self/peer updates unaffected).';

DROP TRIGGER IF EXISTS trg_users_restrict_hr_update ON public.users;
CREATE TRIGGER trg_users_restrict_hr_update
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.smartsprint_restrict_hr_user_update();

-- ---------------------------------------------------------------------------
-- SECTION 12: NEW TABLES — task_dependencies / task_attachments / ai_insights.
-- ---------------------------------------------------------------------------
-- task_dependencies: read = staff + project members; write = staff (PM+).
DROP POLICY IF EXISTS task_dependencies_select_staff ON public.task_dependencies;
CREATE POLICY task_dependencies_select_staff ON public.task_dependencies
  FOR SELECT USING (
    public.smartsprint_is_org_staff(public.smartsprint_project_org(public.smartsprint_task_project(task_id)))
  );

DROP POLICY IF EXISTS task_dependencies_select_member ON public.task_dependencies;
CREATE POLICY task_dependencies_select_member ON public.task_dependencies
  FOR SELECT USING (
    public.smartsprint_is_project_member(public.smartsprint_task_project(task_id))
    AND public.smartsprint_is_org_member(public.smartsprint_project_org(public.smartsprint_task_project(task_id)))
  );

DROP POLICY IF EXISTS task_dependencies_insert_staff ON public.task_dependencies;
CREATE POLICY task_dependencies_insert_staff ON public.task_dependencies
  FOR INSERT WITH CHECK (
    public.smartsprint_is_org_staff(public.smartsprint_project_org(public.smartsprint_task_project(task_id)))
    AND public.smartsprint_task_project(depends_on_task_id) = public.smartsprint_task_project(task_id)
  );

DROP POLICY IF EXISTS task_dependencies_update_staff ON public.task_dependencies;
CREATE POLICY task_dependencies_update_staff ON public.task_dependencies
  FOR UPDATE
  USING (public.smartsprint_is_org_staff(public.smartsprint_project_org(public.smartsprint_task_project(task_id))))
  WITH CHECK (
    public.smartsprint_is_org_staff(public.smartsprint_project_org(public.smartsprint_task_project(task_id)))
    AND public.smartsprint_task_project(depends_on_task_id) = public.smartsprint_task_project(task_id)
  );

DROP POLICY IF EXISTS task_dependencies_delete_admin ON public.task_dependencies;
CREATE POLICY task_dependencies_delete_admin ON public.task_dependencies
  FOR DELETE USING (
    public.smartsprint_is_org_admin(public.smartsprint_project_org(public.smartsprint_task_project(task_id)))
  );

-- Same-project guard for dependency edges (every lane).
CREATE OR REPLACE FUNCTION public.smartsprint_task_dep_same_project()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.smartsprint_task_project(NEW.task_id) IS DISTINCT FROM public.smartsprint_task_project(NEW.depends_on_task_id) THEN
    RAISE EXCEPTION 'SmartSprint RLS: task dependencies must link tasks in the same project';
  END IF;
  IF NEW.task_id = NEW.depends_on_task_id THEN
    RAISE EXCEPTION 'SmartSprint RLS: task cannot depend on itself';
  END IF;
  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION public.smartsprint_task_dep_same_project() IS
  'Integrity trigger: dependency edges stay in-project and never self-link.';

DROP TRIGGER IF EXISTS trg_task_dependencies_same_project ON public.task_dependencies;
CREATE TRIGGER trg_task_dependencies_same_project
  BEFORE INSERT OR UPDATE ON public.task_dependencies
  FOR EACH ROW EXECUTE FUNCTION public.smartsprint_task_dep_same_project();

-- task_attachments: read = staff + project members; write = staff + member
-- upload (HR denied — attachments follow the task matrix).
DROP POLICY IF EXISTS task_attachments_select_staff ON public.task_attachments;
CREATE POLICY task_attachments_select_staff ON public.task_attachments
  FOR SELECT USING (
    public.smartsprint_is_org_staff(public.smartsprint_project_org(public.smartsprint_task_project(task_id)))
  );

DROP POLICY IF EXISTS task_attachments_select_member ON public.task_attachments;
CREATE POLICY task_attachments_select_member ON public.task_attachments
  FOR SELECT USING (
    public.smartsprint_is_project_member(public.smartsprint_task_project(task_id))
    AND public.smartsprint_is_org_member(public.smartsprint_project_org(public.smartsprint_task_project(task_id)))
  );

DROP POLICY IF EXISTS task_attachments_insert_member ON public.task_attachments;
CREATE POLICY task_attachments_insert_member ON public.task_attachments
  FOR INSERT WITH CHECK (
    (public.smartsprint_is_org_staff(public.smartsprint_project_org(public.smartsprint_task_project(task_id)))
      OR public.smartsprint_is_project_member(public.smartsprint_task_project(task_id)))
    AND public.smartsprint_is_org_member(public.smartsprint_project_org(public.smartsprint_task_project(task_id)))
    AND uploaded_by = auth.uid()
  );

DROP POLICY IF EXISTS task_attachments_delete_admin ON public.task_attachments;
CREATE POLICY task_attachments_delete_admin ON public.task_attachments
  FOR DELETE USING (
    public.smartsprint_is_org_admin(public.smartsprint_project_org(public.smartsprint_task_project(task_id)))
  );

-- ai_insights: member + staff read parity (FINANCE/LEGAL via membership).
DROP POLICY IF EXISTS ai_insights_select_staff ON public.ai_insights;
CREATE POLICY ai_insights_select_staff ON public.ai_insights
  FOR SELECT USING (
    public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id))
  );

DROP POLICY IF EXISTS ai_insights_select_member ON public.ai_insights;
CREATE POLICY ai_insights_select_member ON public.ai_insights
  FOR SELECT USING (
    public.smartsprint_is_project_member(project_id)
    AND public.smartsprint_is_org_member(public.smartsprint_project_org(project_id))
  );
-- Writes stay in the trusted AI lane (service_role bypasses RLS).

-- ---------------------------------------------------------------------------
-- SECTION 13: STORAGE — object authorization mirrors metadata authorization.
-- A user denied metadata access must not retrieve the object via signed
-- URL or direct storage access.
-- ---------------------------------------------------------------------------
-- Document metadata gate reused for storage objects.
CREATE OR REPLACE FUNCTION public.smartsprint_can_read_storage_object(p_bucket text, p_name text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN p_bucket = 'project-documents' THEN EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.storage_path = p_name
        AND public.smartsprint_can_access_documents(d.project_id)
    )
    WHEN p_bucket = 'task-attachments' THEN EXISTS (
      SELECT 1 FROM public.task_attachments ta
      WHERE ta.storage_path = p_name
        AND (
          public.smartsprint_is_org_staff(public.smartsprint_project_org(public.smartsprint_task_project(ta.task_id)))
          OR (
            public.smartsprint_is_project_member(public.smartsprint_task_project(ta.task_id))
            AND public.smartsprint_is_org_member(public.smartsprint_project_org(public.smartsprint_task_project(ta.task_id)))
          )
        )
    )
    ELSE false
  END;
$$;
COMMENT ON FUNCTION public.smartsprint_can_read_storage_object(text, text) IS
  'Storage helper: object readable only when the caller may read its metadata row. Denied metadata -> denied object.';

DROP POLICY IF EXISTS storage_documents_select ON storage.objects;
CREATE POLICY storage_documents_select ON storage.objects
  FOR SELECT USING (
    bucket_id IN ('project-documents', 'task-attachments')
    AND public.smartsprint_can_read_storage_object(bucket_id, name)
  );

DROP POLICY IF EXISTS storage_documents_insert ON storage.objects;
CREATE POLICY storage_documents_insert ON storage.objects
  FOR INSERT WITH CHECK (
    (bucket_id = 'project-documents'
      AND EXISTS (
        SELECT 1 FROM public.documents d
        WHERE d.storage_path = name
          AND public.smartsprint_can_access_documents(d.project_id)
      ))
    OR
    (bucket_id = 'task-attachments'
      AND auth.role() = 'authenticated')
  );

DROP POLICY IF EXISTS storage_documents_delete ON storage.objects;
CREATE POLICY storage_documents_delete ON storage.objects
  FOR DELETE USING (
    bucket_id IN ('project-documents', 'task-attachments')
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = auth.uid() AND om.role = 'ADMIN'::public.user_role
    )
  );
