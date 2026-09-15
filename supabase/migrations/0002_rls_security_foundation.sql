-- =============================================================================
-- Migration: 0002_rls_security_foundation
-- Description: Production-grade Supabase/PostgreSQL Row Level Security layer
--              for the SmartSprint AI multi-tenant schema (post-0001).
--
-- Authority model (exactly three roles, no new roles):
--   organization_members.role IN ('ADMIN', 'PROJECT_MANAGER', 'DEVELOPER')
--   is the SOLE authorization source. There is intentionally NO
--   users.organization_id and NO users.role column. A user may belong to
--   multiple organizations with a different role per organization.
--
-- Normal user path protected here:
--   Browser -> Supabase Auth session -> authenticated server/API context
--   -> auth.uid() -> organization_members -> org/project-scoped RLS.
--
-- Privileged path (NOT secured by this migration alone):
--   The application Drizzle pg.Pool uses DATABASE_URL (privileged credentials
--   with BYPASSRLS). Enabling RLS does NOT automatically restrict that pool.
--   The backend/service layer must either (a) issue per-request user-scoped
--   Supabase clients carrying the caller's JWT so these policies apply, or
--   (b) re-enforce the same membership/role checks server-side when using the
--   privileged pool. Service-role / trusted-lane operations intentionally
--   bypass RLS; they are documented in docs/database/rls-security-foundation.md.
--
-- Deployment:
--   Apply with the Supabase CLI or psql against the target database, e.g.:
--     supabase db push
--   or:
--     psql "$DATABASE_URL" -f supabase/migrations/0002_rls_security_foundation.sql
--   Do NOT rely solely on `drizzle-kit push` for security deployment; this
--   file is the deterministic, reviewable source of truth for RLS.
--
-- Properties:
--   * Deterministic: no random values, no timestamps, fixed policy names.
--   * Idempotent: CREATE OR REPLACE for functions, DROP POLICY/TRIGGER
--     IF EXISTS before CREATE. Safe to re-run.
--   * Non-destructive: only ENABLEs RLS, adds policies/functions/triggers.
--     No columns/tables dropped, no data modified.
--   * Fail-closed: unknown/missing membership -> deny. NULL auth.uid() -> deny.
--
-- Policy naming: {table}_{select|insert|update|delete}_{member|staff|admin|self|own}
--   member = any organization/project member (org isolation floor)
--   staff  = ADMIN or PROJECT_MANAGER of the owning organization
--   admin  = ADMIN of the owning organization only
--   self   = row belongs to auth.uid() (users directory self-row)
--   own    = user-scoped private data (notifications, preferences)
-- =============================================================================

-- =============================================================================
-- SECTION 1: HELPER FUNCTIONS (SECURITY DEFINER, explicit search_path)
-- =============================================================================
-- Rationale for SECURITY DEFINER (read carefully):
--   * Policies on organization_members must test membership WITHOUT
--     recursing into organization_members RLS (which would loop forever).
--     These helpers read organization_members (and project/team lookups) as
--     the function owner, bypassing RLS for the CHECK ONLY.
--   * Each helper returns a boolean/uuid verdict derived from auth.uid();
--     never raw table contents. They cannot be used to exfiltrate rows.
--   * search_path is pinned to `public` to block search_path hijacking.
--   * STABLE: result is fixed within a single statement for a given caller.
--   * EXECUTE remains granted to PUBLIC/anon/authenticated because policy
--     evaluation itself needs to call them; a FALSE verdict for strangers
--     (auth.uid() IS NULL or no membership row) denies access.
-- =============================================================================

-- 1.1 Is the caller a member of organization p_org_id?
CREATE OR REPLACE FUNCTION public.smartsprint_is_org_member(p_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_org_id
      AND om.user_id = auth.uid()
  );
$$;
COMMENT ON FUNCTION public.smartsprint_is_org_member(uuid) IS
  'RLS helper: TRUE when auth.uid() holds any organization_members row in p_org_id. SECURITY DEFINER breaks RLS recursion on organization_members; returns boolean verdict only.';

-- 1.2 Is the caller an ADMIN of organization p_org_id?
CREATE OR REPLACE FUNCTION public.smartsprint_is_org_admin(p_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_org_id
      AND om.user_id = auth.uid()
      AND om.role = 'ADMIN'::public.user_role
  );
$$;
COMMENT ON FUNCTION public.smartsprint_is_org_admin(uuid) IS
  'RLS helper: TRUE when auth.uid() is ADMIN in p_org_id (org-scoped, never global). SECURITY DEFINER, verdict only.';

-- 1.3 Is the caller ADMIN or PROJECT_MANAGER of organization p_org_id?
CREATE OR REPLACE FUNCTION public.smartsprint_is_org_staff(p_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('ADMIN'::public.user_role, 'PROJECT_MANAGER'::public.user_role)
  );
$$;
COMMENT ON FUNCTION public.smartsprint_is_org_staff(uuid) IS
  'RLS helper: TRUE when auth.uid() is ADMIN or PROJECT_MANAGER in p_org_id. Used for operational write gates (PM may manage work, never members/roles/budgets).';

-- 1.4 Is arbitrary user p_user_id a member of organization p_org_id?
--     Used for cross-organization FK protection on assignee/owner/manager/lead
--     fields: referenced users must already belong to the target organization.
CREATE OR REPLACE FUNCTION public.smartsprint_user_is_org_member(p_user_id uuid, p_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_org_id
      AND om.user_id = p_user_id
  );
$$;
COMMENT ON FUNCTION public.smartsprint_user_is_org_member(uuid, uuid) IS
  'RLS helper: TRUE when p_user_id holds membership in p_org_id. Prevents assignee/owner/manager smuggling of foreign-org users. Verdict only.';

-- 1.5 Do the caller and p_other_user share at least one organization?
--     Basis for the org-gated users directory (no cross-org enumeration).
CREATE OR REPLACE FUNCTION public.smartsprint_shares_org_with(p_other_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members m1
    JOIN public.organization_members m2
      ON m1.organization_id = m2.organization_id
    WHERE m1.user_id = auth.uid()
      AND m2.user_id = p_other_user
  );
$$;
COMMENT ON FUNCTION public.smartsprint_shares_org_with(uuid) IS
  'RLS helper: TRUE when auth.uid() shares any organization with p_other_user. Gates users SELECT directory without leaking foreign-org users.';

-- 1.6 Is the caller an ADMIN in any organization containing p_other_user?
--     Basis for ADMIN profile maintenance on users (no role column exists on
--     users, so this cannot escalate privileges; role lives in
--     organization_members which has its own ADMIN-only policies).
CREATE OR REPLACE FUNCTION public.smartsprint_is_user_org_admin(p_other_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members m1
    JOIN public.organization_members m2
      ON m1.organization_id = m2.organization_id
    WHERE m1.user_id = auth.uid()
      AND m1.role = 'ADMIN'::public.user_role
      AND m2.user_id = p_other_user
  );
$$;
COMMENT ON FUNCTION public.smartsprint_is_user_org_admin(uuid) IS
  'RLS helper: TRUE when auth.uid() is ADMIN in an org containing p_other_user. Used only for users UPDATE (profile fields); role changes remain locked in organization_members policies.';

-- 1.7 Owning organization of a project (NULL when the project does not exist -> deny).
CREATE OR REPLACE FUNCTION public.smartsprint_project_org(p_project_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.organization_id FROM public.projects p WHERE p.id = p_project_id;
$$;
COMMENT ON FUNCTION public.smartsprint_project_org(uuid) IS
  'RLS helper: owning organization_id of a project, bypassing projects RLS so project-derived policies do not nest RLS evaluations. NULL -> fail-closed.';

-- 1.8 Owning organization of a team.
CREATE OR REPLACE FUNCTION public.smartsprint_team_org(p_team_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT t.organization_id FROM public.teams t WHERE t.id = p_team_id;
$$;
COMMENT ON FUNCTION public.smartsprint_team_org(uuid) IS
  'RLS helper: owning organization_id of a team (NULL -> deny).';

-- 1.9 Owning project of a sprint.
CREATE OR REPLACE FUNCTION public.smartsprint_sprint_project(p_sprint_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.project_id FROM public.sprints s WHERE s.id = p_sprint_id;
$$;
COMMENT ON FUNCTION public.smartsprint_sprint_project(uuid) IS
  'RLS helper: owning project_id of a sprint. Enforces same-project FK consistency (sprint must belong to the row project_id); NULL -> deny.';

-- 1.10 Owning project of a requirement.
CREATE OR REPLACE FUNCTION public.smartsprint_requirement_project(p_requirement_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT r.project_id FROM public.requirements r WHERE r.id = p_requirement_id;
$$;
COMMENT ON FUNCTION public.smartsprint_requirement_project(uuid) IS
  'RLS helper: owning project_id of a requirement. Same-project guard for tasks/backlog/dependencies/AI predictions.';

-- 1.11 Owning project of a folder.
CREATE OR REPLACE FUNCTION public.smartsprint_folder_project(p_folder_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT f.project_id FROM public.folders f WHERE f.id = p_folder_id;
$$;
COMMENT ON FUNCTION public.smartsprint_folder_project(uuid) IS
  'RLS helper: owning project_id of a folder. Guards documents.folder_id and folder parent grafts.';

-- 1.12 Is the caller an explicit member of project p_project_id?
CREATE OR REPLACE FUNCTION public.smartsprint_is_project_member(p_project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_members pm
    WHERE pm.project_id = p_project_id
      AND pm.user_id = auth.uid()
  );
$$;
COMMENT ON FUNCTION public.smartsprint_is_project_member(uuid) IS
  'RLS helper: TRUE when auth.uid() holds a project_members row for p_project_id. Project isolation for DEVELOPER reads/writes; ADMIN/PM use org-staff policies instead.';

-- =============================================================================
-- SECTION 2: ENABLE ROW LEVEL SECURITY (every user-accessible table)
-- =============================================================================
-- NOTE: ENABLE (not FORCE) so the table owner and BYPASSRLS roles
-- (postgres, service_role) keep working for the trusted server lane, while
-- anon/authenticated callers are filtered by the policies below.
-- =============================================================================

ALTER TABLE public.organizations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sprints              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requirements         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backlog              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_predictions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_line_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risks                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_requests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milestones           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folders              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences     ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- SECTION 3.1: TENANCY CORE — organizations / organization_members / users
-- =============================================================================

-- ---- organizations ----
DROP POLICY IF EXISTS organizations_select_member ON public.organizations;
CREATE POLICY organizations_select_member ON public.organizations
  FOR SELECT USING (public.smartsprint_is_org_member(id));

DROP POLICY IF EXISTS organizations_admin_update ON public.organizations;
CREATE POLICY organizations_admin_update ON public.organizations
  FOR UPDATE
  USING (public.smartsprint_is_org_admin(id))
  WITH CHECK (public.smartsprint_is_org_admin(id));
-- No INSERT / DELETE for normal callers: org provisioning (plus the first
-- ADMIN membership) is a trusted server-lane operation via service_role.

-- ---- organization_members (highly sensitive) ----
DROP POLICY IF EXISTS organization_members_select_member ON public.organization_members;
CREATE POLICY organization_members_select_member ON public.organization_members
  FOR SELECT USING (public.smartsprint_is_org_member(organization_id));

DROP POLICY IF EXISTS organization_members_admin_insert ON public.organization_members;
CREATE POLICY organization_members_admin_insert ON public.organization_members
  FOR INSERT WITH CHECK (public.smartsprint_is_org_admin(organization_id));

DROP POLICY IF EXISTS organization_members_admin_update ON public.organization_members;
CREATE POLICY organization_members_admin_update ON public.organization_members
  FOR UPDATE
  USING (public.smartsprint_is_org_admin(organization_id))
  WITH CHECK (public.smartsprint_is_org_admin(organization_id));

DROP POLICY IF EXISTS organization_members_admin_delete ON public.organization_members;
CREATE POLICY organization_members_admin_delete ON public.organization_members
  FOR DELETE USING (public.smartsprint_is_org_admin(organization_id));
-- Key immutability (no moving users between orgs via UPDATE) and last-ADMIN
-- protection are enforced by triggers in SECTION 4 (apply to every role).

-- ---- users (no role column; role lives ONLY in organization_members) ----
DROP POLICY IF EXISTS users_select_self ON public.users;
CREATE POLICY users_select_self ON public.users
  FOR SELECT USING (id = auth.uid());

DROP POLICY IF EXISTS users_select_org_directory ON public.users;
CREATE POLICY users_select_org_directory ON public.users
  FOR SELECT USING (public.smartsprint_shares_org_with(id));

DROP POLICY IF EXISTS users_insert_self ON public.users;
CREATE POLICY users_insert_self ON public.users
  FOR INSERT WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS users_update_self ON public.users;
CREATE POLICY users_update_self ON public.users
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS users_update_admin ON public.users;
CREATE POLICY users_update_admin ON public.users
  FOR UPDATE
  USING (public.smartsprint_is_user_org_admin(id))
  WITH CHECK (public.smartsprint_shares_org_with(id));
-- No DELETE for normal callers: account removal flows through
-- auth.users deletion (cascade) or the trusted server lane.
-- users.id changes are additionally blocked by trigger (SECTION 4), so a
-- profile UPDATE can never become an impersonation path.

-- =============================================================================
-- SECTION 3.2: TEAMS / TEAM MEMBERS / PROJECTS / PROJECT MEMBERS
-- =============================================================================

-- ---- teams ----
DROP POLICY IF EXISTS teams_select_org_member ON public.teams;
CREATE POLICY teams_select_org_member ON public.teams
  FOR SELECT USING (
    public.smartsprint_is_org_staff(organization_id)
    OR (
      public.smartsprint_is_org_member(organization_id)
      AND EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.team_id = teams.id
        AND tm.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS teams_admin_insert ON public.teams;
CREATE POLICY teams_admin_insert ON public.teams
  FOR INSERT WITH CHECK (
    public.smartsprint_is_org_admin(organization_id)
    AND (lead_id IS NULL OR public.smartsprint_user_is_org_member(lead_id, organization_id))
  );

DROP POLICY IF EXISTS teams_admin_update ON public.teams;
CREATE POLICY teams_admin_update ON public.teams
  FOR UPDATE
  USING (public.smartsprint_is_org_admin(organization_id))
  WITH CHECK (
    public.smartsprint_is_org_admin(organization_id)
    AND (lead_id IS NULL OR public.smartsprint_user_is_org_member(lead_id, organization_id))
  );

DROP POLICY IF EXISTS teams_admin_delete ON public.teams;
CREATE POLICY teams_admin_delete ON public.teams
  FOR DELETE USING (public.smartsprint_is_org_admin(organization_id));

-- ---- team_members (membership only, no role column) ----
DROP POLICY IF EXISTS team_members_select_org_member ON public.team_members;
CREATE POLICY team_members_select_org_member ON public.team_members
  FOR SELECT USING (
    public.smartsprint_is_org_member(public.smartsprint_team_org(team_id))
  );

DROP POLICY IF EXISTS team_members_admin_insert ON public.team_members;
CREATE POLICY team_members_admin_insert ON public.team_members
  FOR INSERT WITH CHECK (
    public.smartsprint_is_org_admin(public.smartsprint_team_org(team_id))
    AND public.smartsprint_user_is_org_member(user_id, public.smartsprint_team_org(team_id))
  );

DROP POLICY IF EXISTS team_members_admin_delete ON public.team_members;
CREATE POLICY team_members_admin_delete ON public.team_members
  FOR DELETE USING (
    public.smartsprint_is_org_admin(public.smartsprint_team_org(team_id))
  );
-- No UPDATE: composite PK with no payload columns.

-- ---- projects ----
DROP POLICY IF EXISTS projects_select_org_staff ON public.projects;
CREATE POLICY projects_select_org_staff ON public.projects
  FOR SELECT USING (public.smartsprint_is_org_staff(organization_id));

DROP POLICY IF EXISTS projects_select_member ON public.projects;
CREATE POLICY projects_select_member ON public.projects
  FOR SELECT USING (
    public.smartsprint_is_project_member(id)
    AND public.smartsprint_is_org_member(organization_id)
  );

DROP POLICY IF EXISTS projects_insert_staff ON public.projects;
CREATE POLICY projects_insert_staff ON public.projects
  FOR INSERT WITH CHECK (
    public.smartsprint_is_org_staff(organization_id)
    AND (manager_id IS NULL OR public.smartsprint_user_is_org_member(manager_id, organization_id))
  );

DROP POLICY IF EXISTS projects_update_staff ON public.projects;
CREATE POLICY projects_update_staff ON public.projects
  FOR UPDATE
  USING (public.smartsprint_is_org_staff(organization_id))
  WITH CHECK (
    public.smartsprint_is_org_staff(organization_id)
    AND (manager_id IS NULL OR public.smartsprint_user_is_org_member(manager_id, organization_id))
  );

DROP POLICY IF EXISTS projects_delete_admin ON public.projects;
CREATE POLICY projects_delete_admin ON public.projects
  FOR DELETE USING (public.smartsprint_is_org_admin(organization_id));

-- ---- project_members (membership only, no role column) ----
DROP POLICY IF EXISTS project_members_select_org_member ON public.project_members;
CREATE POLICY project_members_select_org_member ON public.project_members
  FOR SELECT USING (
    public.smartsprint_is_org_member(public.smartsprint_project_org(project_id))
  );

DROP POLICY IF EXISTS project_members_admin_insert ON public.project_members;
CREATE POLICY project_members_admin_insert ON public.project_members
  FOR INSERT WITH CHECK (
    public.smartsprint_is_org_admin(public.smartsprint_project_org(project_id))
    AND public.smartsprint_user_is_org_member(user_id, public.smartsprint_project_org(project_id))
  );

DROP POLICY IF EXISTS project_members_admin_delete ON public.project_members;
CREATE POLICY project_members_admin_delete ON public.project_members
  FOR DELETE USING (
    public.smartsprint_is_org_admin(public.smartsprint_project_org(project_id))
  );
-- No UPDATE: composite PK with no payload. No self-enrollment: only ADMIN
-- can add/remove (blocks privilege self-grant into projects).

-- =============================================================================
-- SECTION 3.3: DELIVERY — sprints / requirements / backlog / tasks
-- =============================================================================

-- ---- sprints ----
DROP POLICY IF EXISTS sprints_select_staff ON public.sprints;
CREATE POLICY sprints_select_staff ON public.sprints
  FOR SELECT USING (
    public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id))
  );

DROP POLICY IF EXISTS sprints_select_member ON public.sprints;
CREATE POLICY sprints_select_member ON public.sprints
  FOR SELECT USING (
    public.smartsprint_is_project_member(project_id)
    AND public.smartsprint_is_org_member(public.smartsprint_project_org(project_id))
  );

DROP POLICY IF EXISTS sprints_insert_staff ON public.sprints;
CREATE POLICY sprints_insert_staff ON public.sprints
  FOR INSERT WITH CHECK (
    public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id))
  );

DROP POLICY IF EXISTS sprints_update_staff ON public.sprints;
CREATE POLICY sprints_update_staff ON public.sprints
  FOR UPDATE
  USING (public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id)))
  WITH CHECK (public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id)));

DROP POLICY IF EXISTS sprints_delete_admin ON public.sprints;
CREATE POLICY sprints_delete_admin ON public.sprints
  FOR DELETE USING (
    public.smartsprint_is_org_admin(public.smartsprint_project_org(project_id))
  );
-- DEVELOPER has no sprint write policies (planning/capacity is PM+).

-- ---- requirements ----
DROP POLICY IF EXISTS requirements_select_staff ON public.requirements;
CREATE POLICY requirements_select_staff ON public.requirements
  FOR SELECT USING (
    public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id))
  );

DROP POLICY IF EXISTS requirements_select_member ON public.requirements;
CREATE POLICY requirements_select_member ON public.requirements
  FOR SELECT USING (
    public.smartsprint_is_project_member(project_id)
    AND public.smartsprint_is_org_member(public.smartsprint_project_org(project_id))
  );

DROP POLICY IF EXISTS requirements_insert_staff ON public.requirements;
CREATE POLICY requirements_insert_staff ON public.requirements
  FOR INSERT WITH CHECK (
    public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id))
    AND (assignee_id IS NULL OR public.smartsprint_user_is_org_member(assignee_id, public.smartsprint_project_org(project_id)))
    AND (sprint_id IS NULL OR public.smartsprint_sprint_project(sprint_id) = project_id)
    AND (dependency_id IS NULL OR public.smartsprint_requirement_project(dependency_id) = project_id)
  );

DROP POLICY IF EXISTS requirements_update_staff ON public.requirements;
CREATE POLICY requirements_update_staff ON public.requirements
  FOR UPDATE
  USING (public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id)))
  WITH CHECK (
    public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id))
    AND (assignee_id IS NULL OR public.smartsprint_user_is_org_member(assignee_id, public.smartsprint_project_org(project_id)))
    AND (sprint_id IS NULL OR public.smartsprint_sprint_project(sprint_id) = project_id)
    AND (dependency_id IS NULL OR public.smartsprint_requirement_project(dependency_id) = project_id)
  );

-- DEVELOPER may update ONLY items assigned to themselves, staying assigned to
-- themselves, inside member projects, with same-project linkage preserved.
DROP POLICY IF EXISTS requirements_update_dev_self ON public.requirements;
CREATE POLICY requirements_update_dev_self ON public.requirements
  FOR UPDATE
  USING (
    assignee_id = auth.uid()
    AND public.smartsprint_is_project_member(project_id)
    AND public.smartsprint_is_org_member(public.smartsprint_project_org(project_id))
  )
  WITH CHECK (
    assignee_id = auth.uid()
    AND public.smartsprint_is_project_member(project_id)
    AND public.smartsprint_is_org_member(public.smartsprint_project_org(project_id))
    AND (sprint_id IS NULL OR public.smartsprint_sprint_project(sprint_id) = project_id)
    AND (dependency_id IS NULL OR public.smartsprint_requirement_project(dependency_id) = project_id)
  );

DROP POLICY IF EXISTS requirements_delete_admin ON public.requirements;
CREATE POLICY requirements_delete_admin ON public.requirements
  FOR DELETE USING (
    public.smartsprint_is_org_admin(public.smartsprint_project_org(project_id))
  );
-- No DEVELOPER INSERT/DELETE on requirements (no self-granted work).

-- ---- backlog (rank-ordered; planning authority is PM+) ----
DROP POLICY IF EXISTS backlog_select_staff ON public.backlog;
CREATE POLICY backlog_select_staff ON public.backlog
  FOR SELECT USING (
    public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id))
  );

DROP POLICY IF EXISTS backlog_select_member ON public.backlog;
CREATE POLICY backlog_select_member ON public.backlog
  FOR SELECT USING (
    public.smartsprint_is_project_member(project_id)
    AND public.smartsprint_is_org_member(public.smartsprint_project_org(project_id))
  );

DROP POLICY IF EXISTS backlog_insert_staff ON public.backlog;
CREATE POLICY backlog_insert_staff ON public.backlog
  FOR INSERT WITH CHECK (
    public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id))
    AND public.smartsprint_requirement_project(requirement_id) = project_id
  );

DROP POLICY IF EXISTS backlog_update_staff ON public.backlog;
CREATE POLICY backlog_update_staff ON public.backlog
  FOR UPDATE
  USING (public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id)))
  WITH CHECK (
    public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id))
    AND public.smartsprint_requirement_project(requirement_id) = project_id
  );

DROP POLICY IF EXISTS backlog_delete_admin ON public.backlog;
CREATE POLICY backlog_delete_admin ON public.backlog
  FOR DELETE USING (
    public.smartsprint_is_org_admin(public.smartsprint_project_org(project_id))
  );

-- ---- tasks (developer boundary is the most sensitive work rule) ----
DROP POLICY IF EXISTS tasks_select_staff ON public.tasks;
CREATE POLICY tasks_select_staff ON public.tasks
  FOR SELECT USING (
    public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id))
  );

DROP POLICY IF EXISTS tasks_select_member ON public.tasks;
CREATE POLICY tasks_select_member ON public.tasks
  FOR SELECT USING (
    public.smartsprint_is_project_member(project_id)
    AND public.smartsprint_is_org_member(public.smartsprint_project_org(project_id))
  );

DROP POLICY IF EXISTS tasks_insert_staff ON public.tasks;
CREATE POLICY tasks_insert_staff ON public.tasks
  FOR INSERT WITH CHECK (
    public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id))
    AND (assignee_id IS NULL OR public.smartsprint_user_is_org_member(assignee_id, public.smartsprint_project_org(project_id)))
    AND (sprint_id IS NULL OR public.smartsprint_sprint_project(sprint_id) = project_id)
    AND (requirement_id IS NULL OR public.smartsprint_requirement_project(requirement_id) = project_id)
  );
-- No DEVELOPER INSERT: work is assigned by ADMIN/PM; developers cannot mint
-- tasks for others, for outsiders, or outside member projects.

DROP POLICY IF EXISTS tasks_update_staff ON public.tasks;
CREATE POLICY tasks_update_staff ON public.tasks
  FOR UPDATE
  USING (public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id)))
  WITH CHECK (
    public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id))
    AND (assignee_id IS NULL OR public.smartsprint_user_is_org_member(assignee_id, public.smartsprint_project_org(project_id)))
    AND (sprint_id IS NULL OR public.smartsprint_sprint_project(sprint_id) = project_id)
    AND (requirement_id IS NULL OR public.smartsprint_requirement_project(requirement_id) = project_id)
  );

-- Developer boundary: may advance/update ONLY tasks currently assigned to
-- themselves, remaining assigned to themselves, inside member projects, with
-- same-project sprint/requirement linkage. Cannot reassign (give away or
-- claim peers/unassigned), cannot touch project/sprint/requirement linkage to
-- escape scope, cannot modify another developer's task.
DROP POLICY IF EXISTS tasks_update_dev_self ON public.tasks;
CREATE POLICY tasks_update_dev_self ON public.tasks
  FOR UPDATE
  USING (
    assignee_id = auth.uid()
    AND public.smartsprint_is_project_member(project_id)
    AND public.smartsprint_is_org_member(public.smartsprint_project_org(project_id))
  )
  WITH CHECK (
    assignee_id = auth.uid()
    AND public.smartsprint_is_project_member(project_id)
    AND public.smartsprint_is_org_member(public.smartsprint_project_org(project_id))
    AND (sprint_id IS NULL OR public.smartsprint_sprint_project(sprint_id) = project_id)
    AND (requirement_id IS NULL OR public.smartsprint_requirement_project(requirement_id) = project_id)
  );

DROP POLICY IF EXISTS tasks_delete_admin ON public.tasks;
CREATE POLICY tasks_delete_admin ON public.tasks
  FOR DELETE USING (
    public.smartsprint_is_org_admin(public.smartsprint_project_org(project_id))
  );

-- =============================================================================
-- SECTION 3.4: AI PREDICTIONS / ACTIVITY LOGS
-- =============================================================================

-- ---- ai_predictions (org/project isolation follows the requirement chain) ----
DROP POLICY IF EXISTS ai_predictions_select_staff ON public.ai_predictions;
CREATE POLICY ai_predictions_select_staff ON public.ai_predictions
  FOR SELECT USING (
    public.smartsprint_is_org_staff(
      public.smartsprint_project_org(
        public.smartsprint_requirement_project(requirement_id)
      )
    )
  );

DROP POLICY IF EXISTS ai_predictions_select_member ON public.ai_predictions;
CREATE POLICY ai_predictions_select_member ON public.ai_predictions
  FOR SELECT USING (
    public.smartsprint_is_project_member(
      public.smartsprint_requirement_project(requirement_id)
    )
    AND public.smartsprint_is_org_member(
      public.smartsprint_project_org(
        public.smartsprint_requirement_project(requirement_id)
      )
    )
  );

-- No INSERT for normal callers: predictions are produced by the trusted AI
-- lane (service_role/Edge Function), never minted by browsers.
DROP POLICY IF EXISTS ai_predictions_update_staff ON public.ai_predictions;
CREATE POLICY ai_predictions_update_staff ON public.ai_predictions
  FOR UPDATE
  USING (
    public.smartsprint_is_org_staff(
      public.smartsprint_project_org(
        public.smartsprint_requirement_project(requirement_id)
      )
    )
  )
  WITH CHECK (
    public.smartsprint_is_org_staff(
      public.smartsprint_project_org(
        public.smartsprint_requirement_project(requirement_id)
      )
    )
    AND (approved_by IS NULL OR approved_by = auth.uid())
    AND (
      suggested_sprint_id IS NULL
      OR public.smartsprint_sprint_project(suggested_sprint_id)
         = public.smartsprint_requirement_project(requirement_id)
    )
  );
-- DEVELOPER cannot approve (no dev update policy; attribution forced to self).

DROP POLICY IF EXISTS ai_predictions_delete_admin ON public.ai_predictions;
CREATE POLICY ai_predictions_delete_admin ON public.ai_predictions
  FOR DELETE USING (
    public.smartsprint_is_org_admin(
      public.smartsprint_project_org(
        public.smartsprint_requirement_project(requirement_id)
      )
    )
  );

-- ---- activity_logs (audit data: readable in scope, never client-writable) ----
DROP POLICY IF EXISTS activity_logs_select_member ON public.activity_logs;
CREATE POLICY activity_logs_select_member ON public.activity_logs
  FOR SELECT USING (
    ((organization_id IS NOT NULL) AND public.smartsprint_is_org_member(organization_id))
    OR ((project_id IS NOT NULL) AND public.smartsprint_is_project_member(project_id))
    OR ((project_id IS NOT NULL) AND public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id)))
    OR (user_id = auth.uid())
  );
-- No INSERT / UPDATE / DELETE for normal callers: history is append-only from
-- the trusted server lane. Any client forgery/erasure attempt is denied.

-- =============================================================================
-- SECTION 3.5: PRIVATE SCOPES — notifications / user_preferences
-- =============================================================================

-- ---- notifications (strict recipient privacy, including from ADMINs) ----
DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_delete_own ON public.notifications;
CREATE POLICY notifications_delete_own ON public.notifications
  FOR DELETE USING (user_id = auth.uid());
-- No INSERT for normal callers: notifications are system-generated via the
-- trusted server lane (prevents spoofed system alerts).

-- ---- user_preferences (one row per user, owner only) ----
DROP POLICY IF EXISTS user_preferences_select_own ON public.user_preferences;
CREATE POLICY user_preferences_select_own ON public.user_preferences
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_preferences_insert_own ON public.user_preferences;
CREATE POLICY user_preferences_insert_own ON public.user_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_preferences_update_own ON public.user_preferences;
CREATE POLICY user_preferences_update_own ON public.user_preferences
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_preferences_delete_own ON public.user_preferences;
CREATE POLICY user_preferences_delete_own ON public.user_preferences
  FOR DELETE USING (user_id = auth.uid());

-- =============================================================================
-- SECTION 3.6: INVITATIONS (security-sensitive, ADMIN-only management)
-- =============================================================================

DROP POLICY IF EXISTS invitations_select_staff ON public.invitations;
CREATE POLICY invitations_select_staff ON public.invitations
  FOR SELECT USING (public.smartsprint_is_org_staff(organization_id));
-- PROJECT_MANAGER gets read visibility (v1); DEVELOPER has no access.
-- Acceptance (pending -> accepted + membership insert) runs in the trusted
-- server lane because the invitee is not yet a member and cannot satisfy
-- ADMIN checks by design.

DROP POLICY IF EXISTS invitations_admin_insert ON public.invitations;
CREATE POLICY invitations_admin_insert ON public.invitations
  FOR INSERT WITH CHECK (public.smartsprint_is_org_admin(organization_id));

DROP POLICY IF EXISTS invitations_admin_update ON public.invitations;
CREATE POLICY invitations_admin_update ON public.invitations
  FOR UPDATE
  USING (public.smartsprint_is_org_admin(organization_id))
  WITH CHECK (public.smartsprint_is_org_admin(organization_id));

DROP POLICY IF EXISTS invitations_admin_delete ON public.invitations;
CREATE POLICY invitations_admin_delete ON public.invitations
  FOR DELETE USING (public.smartsprint_is_org_admin(organization_id));

-- =============================================================================
-- SECTION 3.7: GOVERNANCE — budget / contracts / approvals / risks / changes / milestones
-- =============================================================================
-- Read pattern is uniform: staff see all in-org project rows, developers see
-- member-project rows. Writes are differentiated per table (budgets are the
-- strictest: ADMIN-only).
-- =============================================================================

-- ---- budget_line_items (financial writes: ADMIN-only) ----
DROP POLICY IF EXISTS budget_line_items_select_staff ON public.budget_line_items;
CREATE POLICY budget_line_items_select_staff ON public.budget_line_items
  FOR SELECT USING (
    public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id))
  );

DROP POLICY IF EXISTS budget_line_items_select_member ON public.budget_line_items;
CREATE POLICY budget_line_items_select_member ON public.budget_line_items
  FOR SELECT USING (
    public.smartsprint_is_project_member(project_id)
    AND public.smartsprint_is_org_member(public.smartsprint_project_org(project_id))
  );

DROP POLICY IF EXISTS budget_line_items_admin_insert ON public.budget_line_items;
CREATE POLICY budget_line_items_admin_insert ON public.budget_line_items
  FOR INSERT WITH CHECK (
    public.smartsprint_is_org_admin(public.smartsprint_project_org(project_id))
  );

DROP POLICY IF EXISTS budget_line_items_admin_update ON public.budget_line_items;
CREATE POLICY budget_line_items_admin_update ON public.budget_line_items
  FOR UPDATE
  USING (public.smartsprint_is_org_admin(public.smartsprint_project_org(project_id)))
  WITH CHECK (public.smartsprint_is_org_admin(public.smartsprint_project_org(project_id)));

DROP POLICY IF EXISTS budget_line_items_admin_delete ON public.budget_line_items;
CREATE POLICY budget_line_items_admin_delete ON public.budget_line_items
  FOR DELETE USING (
    public.smartsprint_is_org_admin(public.smartsprint_project_org(project_id))
  );

-- ---- contracts (ADMIN + PM write, DEVELOPER read-only) ----
DROP POLICY IF EXISTS contracts_select_staff ON public.contracts;
CREATE POLICY contracts_select_staff ON public.contracts
  FOR SELECT USING (
    public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id))
  );

DROP POLICY IF EXISTS contracts_select_member ON public.contracts;
CREATE POLICY contracts_select_member ON public.contracts
  FOR SELECT USING (
    public.smartsprint_is_project_member(project_id)
    AND public.smartsprint_is_org_member(public.smartsprint_project_org(project_id))
  );

DROP POLICY IF EXISTS contracts_insert_staff ON public.contracts;
CREATE POLICY contracts_insert_staff ON public.contracts
  FOR INSERT WITH CHECK (
    public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id))
  );

DROP POLICY IF EXISTS contracts_update_staff ON public.contracts;
CREATE POLICY contracts_update_staff ON public.contracts
  FOR UPDATE
  USING (public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id)))
  WITH CHECK (public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id)));

DROP POLICY IF EXISTS contracts_delete_admin ON public.contracts;
CREATE POLICY contracts_delete_admin ON public.contracts
  FOR DELETE USING (
    public.smartsprint_is_org_admin(public.smartsprint_project_org(project_id))
  );

-- ---- approvals (request vs decide split; no self-approval) ----
DROP POLICY IF EXISTS approvals_select_staff ON public.approvals;
CREATE POLICY approvals_select_staff ON public.approvals
  FOR SELECT USING (
    public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id))
  );

DROP POLICY IF EXISTS approvals_select_member ON public.approvals;
CREATE POLICY approvals_select_member ON public.approvals
  FOR SELECT USING (
    public.smartsprint_is_project_member(project_id)
    AND public.smartsprint_is_org_member(public.smartsprint_project_org(project_id))
  );

-- Any project member may file a request, but attribution is forced to self
-- and requests start undecided (blocks pre-approved forgery).
DROP POLICY IF EXISTS approvals_insert_member ON public.approvals;
CREATE POLICY approvals_insert_member ON public.approvals
  FOR INSERT WITH CHECK (
    public.smartsprint_is_project_member(project_id)
    AND public.smartsprint_is_org_member(public.smartsprint_project_org(project_id))
    AND requester_id = auth.uid()
    AND status = 'pending'::public.approval_status
    AND decided_by IS NULL
    AND decided_at IS NULL
  );

DROP POLICY IF EXISTS approvals_insert_staff ON public.approvals;
CREATE POLICY approvals_insert_staff ON public.approvals
  FOR INSERT WITH CHECK (
    public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id))
    AND requester_id = auth.uid()
    AND status = 'pending'::public.approval_status
    AND decided_by IS NULL
    AND decided_at IS NULL
  );

-- Only ADMIN/PM may decide; decider attribution is forced to self and a
-- requester can never decide their own request.
DROP POLICY IF EXISTS approvals_update_staff ON public.approvals;
CREATE POLICY approvals_update_staff ON public.approvals
  FOR UPDATE
  USING (public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id)))
  WITH CHECK (
    public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id))
    AND (decided_by IS NULL OR decided_by = auth.uid())
    AND (status = 'pending'::public.approval_status OR requester_id IS DISTINCT FROM decided_by)
  );

DROP POLICY IF EXISTS approvals_delete_admin ON public.approvals;
CREATE POLICY approvals_delete_admin ON public.approvals
  FOR DELETE USING (
    public.smartsprint_is_org_admin(public.smartsprint_project_org(project_id))
  );

-- ---- risks (DEVELOPER may file, only ADMIN/PM may triage/close) ----
DROP POLICY IF EXISTS risks_select_staff ON public.risks;
CREATE POLICY risks_select_staff ON public.risks
  FOR SELECT USING (
    public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id))
  );

DROP POLICY IF EXISTS risks_select_member ON public.risks;
CREATE POLICY risks_select_member ON public.risks
  FOR SELECT USING (
    public.smartsprint_is_project_member(project_id)
    AND public.smartsprint_is_org_member(public.smartsprint_project_org(project_id))
  );

DROP POLICY IF EXISTS risks_insert_member ON public.risks;
CREATE POLICY risks_insert_member ON public.risks
  FOR INSERT WITH CHECK (
    public.smartsprint_is_project_member(project_id)
    AND public.smartsprint_is_org_member(public.smartsprint_project_org(project_id))
    AND (owner_id IS NULL OR public.smartsprint_user_is_org_member(owner_id, public.smartsprint_project_org(project_id)))
  );

DROP POLICY IF EXISTS risks_insert_staff ON public.risks;
CREATE POLICY risks_insert_staff ON public.risks
  FOR INSERT WITH CHECK (
    public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id))
    AND (owner_id IS NULL OR public.smartsprint_user_is_org_member(owner_id, public.smartsprint_project_org(project_id)))
  );

DROP POLICY IF EXISTS risks_update_staff ON public.risks;
CREATE POLICY risks_update_staff ON public.risks
  FOR UPDATE
  USING (public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id)))
  WITH CHECK (
    public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id))
    AND (owner_id IS NULL OR public.smartsprint_user_is_org_member(owner_id, public.smartsprint_project_org(project_id)))
  );

DROP POLICY IF EXISTS risks_delete_admin ON public.risks;
CREATE POLICY risks_delete_admin ON public.risks
  FOR DELETE USING (
    public.smartsprint_is_org_admin(public.smartsprint_project_org(project_id))
  );

-- ---- change_requests (same request/decide split as approvals) ----
DROP POLICY IF EXISTS change_requests_select_staff ON public.change_requests;
CREATE POLICY change_requests_select_staff ON public.change_requests
  FOR SELECT USING (
    public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id))
  );

DROP POLICY IF EXISTS change_requests_select_member ON public.change_requests;
CREATE POLICY change_requests_select_member ON public.change_requests
  FOR SELECT USING (
    public.smartsprint_is_project_member(project_id)
    AND public.smartsprint_is_org_member(public.smartsprint_project_org(project_id))
  );

DROP POLICY IF EXISTS change_requests_insert_member ON public.change_requests;
CREATE POLICY change_requests_insert_member ON public.change_requests
  FOR INSERT WITH CHECK (
    public.smartsprint_is_project_member(project_id)
    AND public.smartsprint_is_org_member(public.smartsprint_project_org(project_id))
    AND requester_id = auth.uid()
    AND status = 'pending'::public.change_request_status
    AND decided_at IS NULL
  );

DROP POLICY IF EXISTS change_requests_insert_staff ON public.change_requests;
CREATE POLICY change_requests_insert_staff ON public.change_requests
  FOR INSERT WITH CHECK (
    public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id))
    AND requester_id = auth.uid()
    AND status = 'pending'::public.change_request_status
    AND decided_at IS NULL
  );

DROP POLICY IF EXISTS change_requests_update_staff ON public.change_requests;
CREATE POLICY change_requests_update_staff ON public.change_requests
  FOR UPDATE
  USING (public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id)))
  WITH CHECK (
    public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id))
    -- No self-decision (approvals parity): a staff requester may still edit
    -- their own pending request, but approving/rejecting it requires a
    -- different staff member. NULL-safe via IS DISTINCT FROM.
    AND (
      status = 'pending'::public.change_request_status
      OR requester_id IS DISTINCT FROM auth.uid()
    )
  );

DROP POLICY IF EXISTS change_requests_delete_admin ON public.change_requests;
CREATE POLICY change_requests_delete_admin ON public.change_requests
  FOR DELETE USING (
    public.smartsprint_is_org_admin(public.smartsprint_project_org(project_id))
  );

-- ---- milestones (timeline integrity: PM+ write, DEVELOPER read-only) ----
DROP POLICY IF EXISTS milestones_select_staff ON public.milestones;
CREATE POLICY milestones_select_staff ON public.milestones
  FOR SELECT USING (
    public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id))
  );

DROP POLICY IF EXISTS milestones_select_member ON public.milestones;
CREATE POLICY milestones_select_member ON public.milestones
  FOR SELECT USING (
    public.smartsprint_is_project_member(project_id)
    AND public.smartsprint_is_org_member(public.smartsprint_project_org(project_id))
  );

DROP POLICY IF EXISTS milestones_insert_staff ON public.milestones;
CREATE POLICY milestones_insert_staff ON public.milestones
  FOR INSERT WITH CHECK (
    public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id))
  );

DROP POLICY IF EXISTS milestones_update_staff ON public.milestones;
CREATE POLICY milestones_update_staff ON public.milestones
  FOR UPDATE
  USING (public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id)))
  WITH CHECK (public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id)));

DROP POLICY IF EXISTS milestones_delete_admin ON public.milestones;
CREATE POLICY milestones_delete_admin ON public.milestones
  FOR DELETE USING (
    public.smartsprint_is_org_admin(public.smartsprint_project_org(project_id))
  );

-- =============================================================================
-- SECTION 3.8: DOCUMENTS / FOLDERS (project isolation on metadata)
-- =============================================================================
-- Storage bucket/path policies are a separate future task; this migration
-- secures the metadata tables only and intentionally does NOT redesign
-- Supabase Storage.
-- =============================================================================

-- ---- folders ----
DROP POLICY IF EXISTS folders_select_staff ON public.folders;
CREATE POLICY folders_select_staff ON public.folders
  FOR SELECT USING (
    public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id))
  );

DROP POLICY IF EXISTS folders_select_member ON public.folders;
CREATE POLICY folders_select_member ON public.folders
  FOR SELECT USING (
    public.smartsprint_is_project_member(project_id)
    AND public.smartsprint_is_org_member(public.smartsprint_project_org(project_id))
  );

DROP POLICY IF EXISTS folders_insert_staff ON public.folders;
CREATE POLICY folders_insert_staff ON public.folders
  FOR INSERT WITH CHECK (
    public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id))
    AND created_by = auth.uid()
    AND (parent_id IS NULL OR public.smartsprint_folder_project(parent_id) = project_id)
  );

DROP POLICY IF EXISTS folders_insert_member ON public.folders;
CREATE POLICY folders_insert_member ON public.folders
  FOR INSERT WITH CHECK (
    public.smartsprint_is_project_member(project_id)
    AND public.smartsprint_is_org_member(public.smartsprint_project_org(project_id))
    AND created_by = auth.uid()
    AND (parent_id IS NULL OR public.smartsprint_folder_project(parent_id) = project_id)
  );

DROP POLICY IF EXISTS folders_update_staff ON public.folders;
CREATE POLICY folders_update_staff ON public.folders
  FOR UPDATE
  USING (public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id)))
  WITH CHECK (
    public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id))
    AND public.smartsprint_user_is_org_member(created_by, public.smartsprint_project_org(project_id))
    AND (parent_id IS NULL OR public.smartsprint_folder_project(parent_id) = project_id)
  );

-- Developer may rename/reorganize ONLY folders they created, staying in member
-- projects, never stealing ownership or grafting across projects.
DROP POLICY IF EXISTS folders_update_dev_own ON public.folders;
CREATE POLICY folders_update_dev_own ON public.folders
  FOR UPDATE
  USING (
    created_by = auth.uid()
    AND public.smartsprint_is_project_member(project_id)
    AND public.smartsprint_is_org_member(public.smartsprint_project_org(project_id))
  )
  WITH CHECK (
    created_by = auth.uid()
    AND public.smartsprint_is_project_member(project_id)
    AND public.smartsprint_is_org_member(public.smartsprint_project_org(project_id))
    AND (parent_id IS NULL OR public.smartsprint_folder_project(parent_id) = project_id)
  );

DROP POLICY IF EXISTS folders_delete_admin ON public.folders;
CREATE POLICY folders_delete_admin ON public.folders
  FOR DELETE USING (
    public.smartsprint_is_org_admin(public.smartsprint_project_org(project_id))
  );

-- ---- documents ----
DROP POLICY IF EXISTS documents_select_staff ON public.documents;
CREATE POLICY documents_select_staff ON public.documents
  FOR SELECT USING (
    public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id))
  );

DROP POLICY IF EXISTS documents_select_member ON public.documents;
CREATE POLICY documents_select_member ON public.documents
  FOR SELECT USING (
    public.smartsprint_is_project_member(project_id)
    AND public.smartsprint_is_org_member(public.smartsprint_project_org(project_id))
  );

DROP POLICY IF EXISTS documents_insert_staff ON public.documents;
CREATE POLICY documents_insert_staff ON public.documents
  FOR INSERT WITH CHECK (
    public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id))
    AND owner_id = auth.uid()
    AND (folder_id IS NULL OR public.smartsprint_folder_project(folder_id) = project_id)
  );

DROP POLICY IF EXISTS documents_insert_member ON public.documents;
CREATE POLICY documents_insert_member ON public.documents
  FOR INSERT WITH CHECK (
    public.smartsprint_is_project_member(project_id)
    AND public.smartsprint_is_org_member(public.smartsprint_project_org(project_id))
    AND owner_id = auth.uid()
    AND (folder_id IS NULL OR public.smartsprint_folder_project(folder_id) = project_id)
  );

DROP POLICY IF EXISTS documents_update_staff ON public.documents;
CREATE POLICY documents_update_staff ON public.documents
  FOR UPDATE
  USING (public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id)))
  WITH CHECK (
    public.smartsprint_is_org_staff(public.smartsprint_project_org(project_id))
    AND public.smartsprint_user_is_org_member(owner_id, public.smartsprint_project_org(project_id))
    AND (folder_id IS NULL OR public.smartsprint_folder_project(folder_id) = project_id)
  );

-- Developer may version/edit ONLY documents they own, staying owned by
-- themselves in member projects with same-project folder linkage.
DROP POLICY IF EXISTS documents_update_dev_own ON public.documents;
CREATE POLICY documents_update_dev_own ON public.documents
  FOR UPDATE
  USING (
    owner_id = auth.uid()
    AND public.smartsprint_is_project_member(project_id)
    AND public.smartsprint_is_org_member(public.smartsprint_project_org(project_id))
  )
  WITH CHECK (
    owner_id = auth.uid()
    AND public.smartsprint_is_project_member(project_id)
    AND public.smartsprint_is_org_member(public.smartsprint_project_org(project_id))
    AND (folder_id IS NULL OR public.smartsprint_folder_project(folder_id) = project_id)
  );

DROP POLICY IF EXISTS documents_delete_admin ON public.documents;
CREATE POLICY documents_delete_admin ON public.documents
  FOR DELETE USING (
    public.smartsprint_is_org_admin(public.smartsprint_project_org(project_id))
  );

-- =============================================================================
-- SECTION 4: INTEGRITY TRIGGERS (apply to EVERY database role, including the
-- privileged pool and service_role which bypass RLS)
-- =============================================================================
-- RLS gates the authenticated-user path. These triggers close the residual
-- holes that RLS alone cannot express (old-row vs new-row comparisons) and
-- protect the trusted lane against buggy callers:
--   4.1 organization_id is immutable on tenant-rooted tables.
--   4.2 project_id may never cross organization boundaries via UPDATE.
--   4.3 ai_predictions linkage stays in-project/in-org.
--   4.4 organization_members keys are immutable; last ADMIN cannot be
--       removed or demoted (prevents lockout and improper admin deletion).
--   4.5 users.id is immutable (no impersonation via PK rewrite).
-- All trigger functions are SECURITY DEFINER with pinned search_path so the
-- checks work regardless of the caller's RLS visibility; they raise
-- exceptions (fail-closed) instead of exposing data.
-- =============================================================================

-- ---- 4.1 organization_id immutability ----
CREATE OR REPLACE FUNCTION public.smartsprint_forbid_organization_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.organization_id IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'SmartSprint RLS: %.organization_id is immutable (% -> %)',
      TG_TABLE_NAME, OLD.organization_id, NEW.organization_id;
  END IF;
  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION public.smartsprint_forbid_organization_change() IS
  'Integrity trigger: tenant roots never move organizations. Blocks cross-org transplant via UPDATE for every role (RLS cannot compare old vs new rows).';

DROP TRIGGER IF EXISTS trg_projects_forbid_org_change ON public.projects;
CREATE TRIGGER trg_projects_forbid_org_change
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.smartsprint_forbid_organization_change();

DROP TRIGGER IF EXISTS trg_teams_forbid_org_change ON public.teams;
CREATE TRIGGER trg_teams_forbid_org_change
  BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.smartsprint_forbid_organization_change();

DROP TRIGGER IF EXISTS trg_invitations_forbid_org_change ON public.invitations;
CREATE TRIGGER trg_invitations_forbid_org_change
  BEFORE UPDATE ON public.invitations
  FOR EACH ROW EXECUTE FUNCTION public.smartsprint_forbid_organization_change();

-- ---- 4.2 project_id must never cross organization boundaries ----
CREATE OR REPLACE FUNCTION public.smartsprint_forbid_cross_org_project_move()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_old_org uuid;
  v_new_org uuid;
BEGIN
  IF OLD.project_id IS DISTINCT FROM NEW.project_id THEN
    SELECT p.organization_id INTO v_old_org FROM public.projects p WHERE p.id = OLD.project_id;
    SELECT p.organization_id INTO v_new_org FROM public.projects p WHERE p.id = NEW.project_id;
    IF v_old_org IS DISTINCT FROM v_new_org THEN
      RAISE EXCEPTION 'SmartSprint RLS: %.project_id cross-organization move denied (% -> %)',
        TG_TABLE_NAME, OLD.project_id, NEW.project_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION public.smartsprint_forbid_cross_org_project_move() IS
  'Integrity trigger: a row may never be re-parented into another organization project. Closes the dual-membership UPDATE hole (member of orgs A+B moving A data into B where B members could then read it). Same-org moves still require RLS authorization.';

DROP TRIGGER IF EXISTS trg_sprints_forbid_cross_org_move ON public.sprints;
CREATE TRIGGER trg_sprints_forbid_cross_org_move
  BEFORE UPDATE ON public.sprints
  FOR EACH ROW EXECUTE FUNCTION public.smartsprint_forbid_cross_org_project_move();

DROP TRIGGER IF EXISTS trg_requirements_forbid_cross_org_move ON public.requirements;
CREATE TRIGGER trg_requirements_forbid_cross_org_move
  BEFORE UPDATE ON public.requirements
  FOR EACH ROW EXECUTE FUNCTION public.smartsprint_forbid_cross_org_project_move();

DROP TRIGGER IF EXISTS trg_tasks_forbid_cross_org_move ON public.tasks;
CREATE TRIGGER trg_tasks_forbid_cross_org_move
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.smartsprint_forbid_cross_org_project_move();

DROP TRIGGER IF EXISTS trg_backlog_forbid_cross_org_move ON public.backlog;
CREATE TRIGGER trg_backlog_forbid_cross_org_move
  BEFORE UPDATE ON public.backlog
  FOR EACH ROW EXECUTE FUNCTION public.smartsprint_forbid_cross_org_project_move();

DROP TRIGGER IF EXISTS trg_budget_line_items_forbid_cross_org_move ON public.budget_line_items;
CREATE TRIGGER trg_budget_line_items_forbid_cross_org_move
  BEFORE UPDATE ON public.budget_line_items
  FOR EACH ROW EXECUTE FUNCTION public.smartsprint_forbid_cross_org_project_move();

DROP TRIGGER IF EXISTS trg_contracts_forbid_cross_org_move ON public.contracts;
CREATE TRIGGER trg_contracts_forbid_cross_org_move
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.smartsprint_forbid_cross_org_project_move();

DROP TRIGGER IF EXISTS trg_approvals_forbid_cross_org_move ON public.approvals;
CREATE TRIGGER trg_approvals_forbid_cross_org_move
  BEFORE UPDATE ON public.approvals
  FOR EACH ROW EXECUTE FUNCTION public.smartsprint_forbid_cross_org_project_move();

DROP TRIGGER IF EXISTS trg_risks_forbid_cross_org_move ON public.risks;
CREATE TRIGGER trg_risks_forbid_cross_org_move
  BEFORE UPDATE ON public.risks
  FOR EACH ROW EXECUTE FUNCTION public.smartsprint_forbid_cross_org_project_move();

DROP TRIGGER IF EXISTS trg_change_requests_forbid_cross_org_move ON public.change_requests;
CREATE TRIGGER trg_change_requests_forbid_cross_org_move
  BEFORE UPDATE ON public.change_requests
  FOR EACH ROW EXECUTE FUNCTION public.smartsprint_forbid_cross_org_project_move();

DROP TRIGGER IF EXISTS trg_milestones_forbid_cross_org_move ON public.milestones;
CREATE TRIGGER trg_milestones_forbid_cross_org_move
  BEFORE UPDATE ON public.milestones
  FOR EACH ROW EXECUTE FUNCTION public.smartsprint_forbid_cross_org_project_move();

DROP TRIGGER IF EXISTS trg_folders_forbid_cross_org_move ON public.folders;
CREATE TRIGGER trg_folders_forbid_cross_org_move
  BEFORE UPDATE ON public.folders
  FOR EACH ROW EXECUTE FUNCTION public.smartsprint_forbid_cross_org_project_move();

DROP TRIGGER IF EXISTS trg_documents_forbid_cross_org_move ON public.documents;
CREATE TRIGGER trg_documents_forbid_cross_org_move
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.smartsprint_forbid_cross_org_project_move();

-- ---- 4.3 ai_predictions linkage guard ----
CREATE OR REPLACE FUNCTION public.smartsprint_ai_prediction_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_old_proj uuid;
  v_new_proj uuid;
  v_old_org  uuid;
  v_new_org  uuid;
  v_sprint_proj uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.requirement_id IS DISTINCT FROM NEW.requirement_id THEN
    SELECT r.project_id INTO v_old_proj FROM public.requirements r WHERE r.id = OLD.requirement_id;
    SELECT r.project_id INTO v_new_proj FROM public.requirements r WHERE r.id = NEW.requirement_id;
    SELECT p.organization_id INTO v_old_org FROM public.projects p WHERE p.id = v_old_proj;
    SELECT p.organization_id INTO v_new_org FROM public.projects p WHERE p.id = v_new_proj;
    IF v_old_org IS DISTINCT FROM v_new_org THEN
      RAISE EXCEPTION 'SmartSprint RLS: ai_predictions cross-organization requirement move denied';
    END IF;
  ELSE
    SELECT r.project_id INTO v_new_proj FROM public.requirements r WHERE r.id = NEW.requirement_id;
  END IF;
  IF NEW.suggested_sprint_id IS NOT NULL THEN
    SELECT s.project_id INTO v_sprint_proj FROM public.sprints s WHERE s.id = NEW.suggested_sprint_id;
    IF v_sprint_proj IS DISTINCT FROM v_new_proj THEN
      RAISE EXCEPTION 'SmartSprint RLS: ai_predictions.suggested_sprint_id must belong to the requirement project';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION public.smartsprint_ai_prediction_guard() IS
  'Integrity trigger: AI predictions inherit org/project isolation from their requirement; suggested sprints must be same-project. Applies to the trusted AI lane as well as authenticated callers.';

DROP TRIGGER IF EXISTS trg_ai_predictions_guard ON public.ai_predictions;
CREATE TRIGGER trg_ai_predictions_guard
  BEFORE INSERT OR UPDATE ON public.ai_predictions
  FOR EACH ROW EXECUTE FUNCTION public.smartsprint_ai_prediction_guard();

-- ---- 4.4 organization_members: key immutability + last-ADMIN protection ----
CREATE OR REPLACE FUNCTION public.smartsprint_protect_organization_members()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_admin_count integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'ADMIN'::public.user_role THEN
      SELECT COUNT(*) INTO v_admin_count
      FROM public.organization_members
      WHERE organization_id = OLD.organization_id
        AND role = 'ADMIN'::public.user_role;
      IF v_admin_count <= 1 THEN
        RAISE EXCEPTION 'SmartSprint RLS: cannot remove the last ADMIN of organization %', OLD.organization_id;
      END IF;
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.organization_id IS DISTINCT FROM NEW.organization_id
       OR OLD.user_id IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'SmartSprint RLS: organization_members key (organization_id, user_id) is immutable; use DELETE + INSERT via an ADMIN';
    END IF;
    IF OLD.role = 'ADMIN'::public.user_role
       AND NEW.role IS DISTINCT FROM 'ADMIN'::public.user_role THEN
      SELECT COUNT(*) INTO v_admin_count
      FROM public.organization_members
      WHERE organization_id = OLD.organization_id
        AND role = 'ADMIN'::public.user_role;
      IF v_admin_count <= 1 THEN
        RAISE EXCEPTION 'SmartSprint RLS: cannot demote the last ADMIN of organization %', OLD.organization_id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;
COMMENT ON FUNCTION public.smartsprint_protect_organization_members() IS
  'Integrity trigger: membership keys immutable (no moving users between orgs via UPDATE); last ADMIN can never be deleted or demoted, for every role including service_role.';

DROP TRIGGER IF EXISTS trg_organization_members_protect ON public.organization_members;
CREATE TRIGGER trg_organization_members_protect
  BEFORE UPDATE OR DELETE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.smartsprint_protect_organization_members();

-- ---- 4.5 users.id immutability (anti-impersonation) ----
CREATE OR REPLACE FUNCTION public.smartsprint_forbid_user_id_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION 'SmartSprint RLS: users.id is immutable';
  END IF;
  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION public.smartsprint_forbid_user_id_change() IS
  'Integrity trigger: users.id must equal auth.users.id forever; blocks impersonation via PK rewrite for every role.';

DROP TRIGGER IF EXISTS trg_users_forbid_id_change ON public.users;
CREATE TRIGGER trg_users_forbid_id_change
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.smartsprint_forbid_user_id_change();

-- =============================================================================
-- SECTION 5: POST-MIGRATION VERIFICATION (manual checklist for reviewers/CI)
-- =============================================================================
-- 1. RLS enabled on all 24 tables:
--      SELECT tablename, rowsecurity FROM pg_tables
--      WHERE schemaname = 'public' ORDER BY 1;
--    Every application table must show rowsecurity = true.
-- 2. Policies exist (expect 70+):
--      SELECT tablename, policyname, cmd FROM pg_policies
--      WHERE schemaname = 'public' ORDER BY 1, 2;
-- 3. No unrestricted policies:
--      SELECT * FROM pg_policies WHERE schemaname = 'public'
--        AND (qual = 'true' OR with_check = 'true');
--    Must return zero rows on sensitive tables.
-- 4. Helpers are SECURITY DEFINER with pinned search_path:
--      SELECT proname, prosecdef, proconfig FROM pg_proc
--      WHERE pronamespace = 'public'::regnamespace
--        AND proname LIKE 'smartsprint\_%';
-- 5. Behavioral spot-checks (as fixture JWTs, never service_role):
--      adminA (ADMIN Org A, DEVELOPER Org B) sees Org A rows, zero Org B-inaccessible rows;
--      multi-org member sees scoped rows per org without blending;
--      developer updating peer/unassigned task -> denied;
--      developer changing assignee_id/project_id -> denied;
--      cross-org SELECT/INSERT/UPDATE/DELETE -> denied;
--      other-user notifications/preferences -> zero rows;
--      activity_logs INSERT/UPDATE/DELETE as authenticated -> denied.
-- =============================================================================
