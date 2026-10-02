-- =============================================================================
-- Migration: 0007_commitments
-- Description: Add project commitments for outcome/deliverable tracking.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.commitments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  commitment_type text NOT NULL DEFAULT 'deliverable',
  status text NOT NULL DEFAULT 'planned',
  due_date date,
  progress integer NOT NULL DEFAULT 0,
  owner_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,

  CONSTRAINT commitments_project_id_fkey
    FOREIGN KEY (project_id)
    REFERENCES public.projects(id)
    ON DELETE CASCADE,

  CONSTRAINT commitments_owner_id_fkey
    FOREIGN KEY (owner_id)
    REFERENCES public.users(id)
    ON DELETE SET NULL,

  CONSTRAINT commitments_progress_check
    CHECK (progress >= 0 AND progress <= 100),

  CONSTRAINT commitments_type_check
    CHECK (commitment_type IN ('outcome', 'deliverable', 'milestone', 'obligation')),

  CONSTRAINT commitments_status_check
    CHECK (status IN ('planned', 'inProgress', 'completed', 'blocked'))
);

CREATE INDEX IF NOT EXISTS idx_commitments_project_id
  ON public.commitments(project_id);

CREATE INDEX IF NOT EXISTS idx_commitments_owner_id
  ON public.commitments(owner_id);


DROP POLICY IF EXISTS commitments_select_staff ON public.commitments;
DROP POLICY IF EXISTS commitments_select_member ON public.commitments;
DROP POLICY IF EXISTS commitments_insert_staff ON public.commitments;
DROP POLICY IF EXISTS commitments_update_staff ON public.commitments;
DROP POLICY IF EXISTS commitments_delete_admin ON public.commitments;

ALTER TABLE public.commitments ENABLE ROW LEVEL SECURITY;

CREATE POLICY commitments_select_staff
  ON public.commitments
  FOR SELECT
  USING (
    public.smartsprint_is_org_staff(
      public.smartsprint_project_org(project_id)
    )
  );

CREATE POLICY commitments_select_member
  ON public.commitments
  FOR SELECT
  USING (
    public.smartsprint_is_project_member(project_id)
    AND public.smartsprint_is_org_member(
      public.smartsprint_project_org(project_id)
    )
  );

CREATE POLICY commitments_insert_staff
  ON public.commitments
  FOR INSERT
  WITH CHECK (
    public.smartsprint_is_org_staff(
      public.smartsprint_project_org(project_id)
    )
    AND (
      owner_id IS NULL
      OR public.smartsprint_user_is_org_member(
        owner_id,
        public.smartsprint_project_org(project_id)
      )
    )
  );

CREATE POLICY commitments_update_staff
  ON public.commitments
  FOR UPDATE
  USING (
    public.smartsprint_is_org_staff(
      public.smartsprint_project_org(project_id)
    )
  )
  WITH CHECK (
    public.smartsprint_is_org_staff(
      public.smartsprint_project_org(project_id)
    )
    AND (
      owner_id IS NULL
      OR public.smartsprint_user_is_org_member(
        owner_id,
        public.smartsprint_project_org(project_id)
      )
    )
  );

CREATE POLICY commitments_delete_admin
  ON public.commitments
  FOR DELETE
  USING (
    public.smartsprint_is_org_admin(
      public.smartsprint_project_org(project_id)
    )
  );
