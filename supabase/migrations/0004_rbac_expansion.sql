-- =============================================================================
-- Migration: 0004_rbac_expansion
-- Description: Six-role RBAC expansion (FINANCE / LEGAL / HR), risk domain,
--              role-change request workflow, task dependencies, task
--              attachments, AI insight dedup columns, storage buckets.
--
-- Authority: Master Implementation Specification §2 (Final MVP).
--   * §2.1: add FINANCE, LEGAL, HR to user_role enum.
--   * §2.2: add nullable riskDomain to risks (NULL = PM/ADMIN only).
--   * §2.3: create role_change_requests with pending-per-user guard.
--   * §5 (MVP-required 1): create task_dependencies (blocks/is_blocked_by).
--   * §5.1 (MVP-quality 10): create task_attachments (Supabase Storage).
--   * AI risk dedup equivalence key columns on ai_insights.
--
-- Intentionally DEFERRED (do NOT create in MVP):
--   employees, compensation data, emergency contacts, employment dates,
--   leave_requests, attendance_records, onboarding_checklists.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 2.1 Add roles to user_role enum.
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction block on
-- some Postgres versions. If `supabase db push` wraps this file in a
-- transaction and fails, run these three statements separately outside a
-- transaction, then re-run the remainder of this file.
-- ---------------------------------------------------------------------------
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'FINANCE';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'LEGAL';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'HR';

-- Supporting enums (idempotent).
DO $$ BEGIN
  CREATE TYPE risk_domain AS ENUM ('technical', 'budget', 'legal', 'resource');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE role_change_request_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE task_dependency_type AS ENUM ('blocks', 'is_blocked_by');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- activity_logs.entity_type gains the role-change audit value.
ALTER TYPE entity_type_enum ADD VALUE IF NOT EXISTS 'role_change_request';

-- ---------------------------------------------------------------------------
-- 2.2 Add risk domain to risks. Existing rows remain NULL (= PM/ADMIN only
-- for AI-risk approval and specialist resolution).
-- ---------------------------------------------------------------------------
ALTER TABLE risks ADD COLUMN IF NOT EXISTS risk_domain risk_domain;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_risks_domain') THEN
    CREATE INDEX idx_risks_domain ON risks USING btree (risk_domain);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2.3 Create role_change_requests (§2.3 exact DDL, status as enum).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS role_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  "current_role" user_role NOT NULL,
  requested_role user_role NOT NULL,
  status role_change_request_status NOT NULL DEFAULT 'pending',
  requested_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  decided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (requested_role <> "current_role")
);

CREATE INDEX IF NOT EXISTS idx_role_change_requests_user
  ON role_change_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_role_change_requests_org
  ON role_change_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_role_change_requests_status
  ON role_change_requests(status);

-- Prevent multiple simultaneous pending requests for the same target.
CREATE UNIQUE INDEX IF NOT EXISTS uq_role_change_requests_pending_per_user
  ON role_change_requests(user_id)
  WHERE status = 'pending';

ALTER TABLE role_change_requests ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- MVP-required 1: task_dependencies (dependency-aware risk detection).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS task_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  type task_dependency_type NOT NULL DEFAULT 'blocks',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, depends_on_task_id),
  CHECK (task_id <> depends_on_task_id)
);

CREATE INDEX IF NOT EXISTS idx_task_dependencies_task_id
  ON task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on
  ON task_dependencies(depends_on_task_id);

ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- MVP-quality 10: task_attachments (Supabase Storage metadata).
-- RLS + storage authorization must mirror task/project access (see 0005).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS task_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'task-attachments',
  file_size bigint NOT NULL,
  mime_type text,
  uploaded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_attachments_task_id
  ON task_attachments(task_id);

ALTER TABLE task_attachments ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- AI risk dedup equivalence columns on ai_insights:
--   project_id + issue_type(type) + entity_id
-- ---------------------------------------------------------------------------
ALTER TABLE ai_insights ADD COLUMN IF NOT EXISTS issue_type text;
ALTER TABLE ai_insights ADD COLUMN IF NOT EXISTS entity_id uuid;
ALTER TABLE ai_insights ADD COLUMN IF NOT EXISTS risk_domain risk_domain;
ALTER TABLE ai_insights ADD COLUMN IF NOT EXISTS dedup_key text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_ai_insights_dedup') THEN
    CREATE UNIQUE INDEX uq_ai_insights_dedup
      ON ai_insights(project_id, type, entity_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Storage buckets (metadata tables secured in 0005; bucket policies must
-- match document metadata authorization — see docs/deployment).
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-documents', 'project-documents', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('task-attachments', 'task-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- DEFERRED HR DOMAIN (intentionally not built in MVP):
-- employees, compensation data, emergency contacts, employment dates,
-- leave_requests, attendance_records, onboarding_checklists.
-- HR operates only on users/org-members/invitations per §1.4.
-- ---------------------------------------------------------------------------
