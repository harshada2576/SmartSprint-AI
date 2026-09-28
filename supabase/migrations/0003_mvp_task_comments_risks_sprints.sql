-- =============================================================================
-- Migration: 0003_mvp_task_comments_risks_sprints
-- Description: Task enhancements (progress, blocked fields, hours),
--              task comments table, risk enhancements, ai insights table,
--              and sprint capacity enhancements.
-- =============================================================================

-- 1. Extend task_column_status enum if needed
ALTER TYPE task_column_status ADD VALUE IF NOT EXISTS 'blocked';

-- 2. Extend tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS progress_percent integer DEFAULT 0 NOT NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_hours numeric(6, 2);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS actual_hours numeric(6, 2);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_blocked boolean DEFAULT false NOT NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS blocked_reason text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS blocked_at timestamp with time zone;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_progress_percent_check') THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_progress_percent_check CHECK (progress_percent >= 0 AND progress_percent <= 100);
  END IF;
END $$;

-- 3. Extend sprints table
ALTER TABLE sprints ADD COLUMN IF NOT EXISTS capacity_points integer;
ALTER TABLE sprints ADD COLUMN IF NOT EXISTS capacity_hours integer;
ALTER TABLE sprints ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL;

-- 4. Extend risks table
ALTER TABLE risks ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES tasks(id) ON DELETE SET NULL;
ALTER TABLE risks ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE risks ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual' NOT NULL;

-- 5. Create task_comments table
CREATE TABLE IF NOT EXISTS task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_user_id ON task_comments(user_id);

-- 6. Create ai_insights table
CREATE TABLE IF NOT EXISTS ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  severity text DEFAULT 'medium' NOT NULL,
  reasoning jsonb,
  status text DEFAULT 'active' NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_insights_project_id ON ai_insights(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_insights_type ON ai_insights(type);

-- 7. Enable RLS and setup policies
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'task_comments' AND policyname = 'task_comments_select_member') THEN
    CREATE POLICY task_comments_select_member ON task_comments FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM tasks t
        JOIN project_members pm ON pm.project_id = t.project_id
        WHERE t.id = task_comments.task_id AND pm.user_id = auth.uid()
      ) OR EXISTS (
        SELECT 1 FROM tasks t
        JOIN projects p ON p.id = t.project_id
        JOIN organization_members om ON om.organization_id = p.organization_id
        WHERE t.id = task_comments.task_id AND om.user_id = auth.uid() AND om.role IN ('ADMIN', 'PROJECT_MANAGER')
      )
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'task_comments' AND policyname = 'task_comments_insert_member') THEN
    CREATE POLICY task_comments_insert_member ON task_comments FOR INSERT WITH CHECK (
      auth.uid() = user_id AND (
        EXISTS (
          SELECT 1 FROM tasks t
          JOIN project_members pm ON pm.project_id = t.project_id
          WHERE t.id = task_comments.task_id AND pm.user_id = auth.uid()
        ) OR EXISTS (
          SELECT 1 FROM tasks t
          JOIN projects p ON p.id = t.project_id
          JOIN organization_members om ON om.organization_id = p.organization_id
          WHERE t.id = task_comments.task_id AND om.user_id = auth.uid() AND om.role IN ('ADMIN', 'PROJECT_MANAGER')
        )
      )
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_insights' AND policyname = 'ai_insights_select_member') THEN
    CREATE POLICY ai_insights_select_member ON ai_insights FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM project_members pm
        WHERE pm.project_id = ai_insights.project_id AND pm.user_id = auth.uid()
      ) OR EXISTS (
        SELECT 1 FROM projects p
        JOIN organization_members om ON om.organization_id = p.organization_id
        WHERE p.id = ai_insights.project_id AND om.user_id = auth.uid()
      )
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_insights' AND policyname = 'ai_insights_manage_staff') THEN
    CREATE POLICY ai_insights_manage_staff ON ai_insights FOR ALL USING (
      EXISTS (
        SELECT 1 FROM projects p
        JOIN organization_members om ON om.organization_id = p.organization_id
        WHERE p.id = ai_insights.project_id AND om.user_id = auth.uid() AND om.role IN ('ADMIN', 'PROJECT_MANAGER')
      )
    );
  END IF;
END $$;
