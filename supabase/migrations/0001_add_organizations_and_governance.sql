-- Custom SQL migration file, put your code below!

-- 1. Create new enums
CREATE TYPE "public"."document_type" AS ENUM('pdf', 'doc', 'image', 'code', 'spreadsheet', 'other');
CREATE TYPE "public"."contract_status" AS ENUM('active', 'pending', 'expired', 'terminated');
CREATE TYPE "public"."approval_type" AS ENUM('scope', 'budget', 'vendor', 'resource');
CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'rejected');
CREATE TYPE "public"."risk_level" AS ENUM('high', 'medium', 'low');
CREATE TYPE "public"."risk_status" AS ENUM('open', 'mitigated', 'closed');
CREATE TYPE "public"."change_request_type" AS ENUM('feature', 'technical', 'process');
CREATE TYPE "public"."change_request_status" AS ENUM('pending', 'approved', 'rejected');
CREATE TYPE "public"."activity_action" AS ENUM('created', 'updated', 'deleted', 'approved', 'rejected', 'completed', 'assigned', 'commented');
CREATE TYPE "public"."entity_type_enum" AS ENUM('project', 'requirement', 'task', 'sprint', 'team', 'document', 'budget', 'approval', 'risk', 'change_request');
CREATE TYPE "public"."notification_type" AS ENUM('task', 'sprint', 'approval', 'document', 'budget', 'system');

-- 2. Create organizations table
CREATE TABLE "organizations" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "name" text NOT NULL,
    "slug" text NOT NULL,
    "industry" text,
    "timezone" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations" USING btree ("slug");

-- 3. Create organization_members table
CREATE TABLE "organization_members" (
    "organization_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "role" "user_role" DEFAULT 'DEVELOPER' NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY ("organization_id", "user_id")
);
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "idx_organization_members_user_id" ON "organization_members" USING btree ("user_id" uuid_ops);

-- 4. Modify users table: remove self-referential FK, remove role column, add new columns
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_id_fkey";
ALTER TABLE "users" DROP COLUMN IF EXISTS "role";
ALTER TABLE "users" ADD COLUMN "job_title" text;
ALTER TABLE "users" ADD COLUMN "avatar_url" text;
ALTER TABLE "users" ADD COLUMN "last_active_at" timestamp with time zone;

-- 5. Modify teams table: add organization_id and updated_at
ALTER TABLE "teams" ADD COLUMN "organization_id" uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid;
ALTER TABLE "teams" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "teams" ADD CONSTRAINT "teams_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "idx_teams_organization_id" ON "teams" USING btree ("organization_id" uuid_ops);

-- 6. Modify projects table: add organization_id, description, start_date, budget_total, budget_currency
ALTER TABLE "projects" ADD COLUMN "organization_id" uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid;
ALTER TABLE "projects" ADD COLUMN "description" text;
ALTER TABLE "projects" ADD COLUMN "start_date" date;
ALTER TABLE "projects" ADD COLUMN "budget_total" numeric(12,2);
ALTER TABLE "projects" ADD COLUMN "budget_currency" text DEFAULT 'USD';
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "idx_projects_organization_id" ON "projects" USING btree ("organization_id" uuid_ops);

-- 7. Modify sprints table: add index on project_id
CREATE INDEX "idx_sprints_project_id" ON "sprints" USING btree ("project_id" uuid_ops);

-- 8. Modify requirements table: make display_id NOT NULL
-- First update any null display_ids to a placeholder (will need proper backfill in production)
UPDATE "requirements" SET "display_id" = 'REQ-' || substr("id"::text, 1, 8) WHERE "display_id" IS NULL;
ALTER TABLE "requirements" ALTER COLUMN "display_id" SET NOT NULL;

-- 9. Modify backlog table: make project_id NOT NULL
UPDATE "backlog" SET "project_id" = (SELECT "project_id" FROM "requirements" WHERE "requirements"."id" = "backlog"."requirement_id") WHERE "project_id" IS NULL;
ALTER TABLE "backlog" ALTER COLUMN "project_id" SET NOT NULL;
CREATE INDEX "idx_backlog_project_id" ON "backlog" USING btree ("project_id" uuid_ops);

-- 10. Modify tasks table: make display_id NOT NULL, add due_date, description
UPDATE "tasks" SET "display_id" = 'TASK-' || substr("id"::text, 1, 8) WHERE "display_id" IS NULL;
ALTER TABLE "tasks" ALTER COLUMN "display_id" SET NOT NULL;
ALTER TABLE "tasks" ADD COLUMN "description" text;
ALTER TABLE "tasks" ADD COLUMN "due_date" date;

-- 11. Modify ai_predictions table: add approved_by, approved_at, updated_at
ALTER TABLE "ai_predictions" ADD COLUMN "approved_by" uuid;
ALTER TABLE "ai_predictions" ADD COLUMN "approved_at" timestamp with time zone;
ALTER TABLE "ai_predictions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "ai_predictions" ADD CONSTRAINT "ai_predictions_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "idx_ai_predictions_recommendation_status" ON "ai_predictions" USING btree ("recommendation_status" enum_ops);

-- 12. Modify activity_logs table: add organization_id, change action/entity_type to enums
ALTER TABLE "activity_logs" ADD COLUMN "organization_id" uuid;
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "idx_activity_logs_organization_id" ON "activity_logs" USING btree ("organization_id" uuid_ops);

-- Note: Converting action and entity_type columns from text to enum requires data migration
-- This is done in steps: add new enum columns, backfill, drop old columns, rename new columns
ALTER TABLE "activity_logs" ADD COLUMN "action_new" "activity_action";
ALTER TABLE "activity_logs" ADD COLUMN "entity_type_new" "entity_type_enum";

-- Backfill action_new from action (mapping text to enum)
UPDATE "activity_logs" SET "action_new" = CASE
    WHEN "action" = 'created' THEN 'created'::activity_action
    WHEN "action" = 'updated' THEN 'updated'::activity_action
    WHEN "action" = 'deleted' THEN 'deleted'::activity_action
    WHEN "action" = 'approved' THEN 'approved'::activity_action
    WHEN "action" = 'rejected' THEN 'rejected'::activity_action
    WHEN "action" = 'completed' THEN 'completed'::activity_action
    WHEN "action" = 'assigned' THEN 'assigned'::activity_action
    WHEN "action" = 'commented' THEN 'commented'::activity_action
    ELSE 'created'::activity_action
END;

-- Backfill entity_type_new from entity_type
UPDATE "activity_logs" SET "entity_type_new" = CASE
    WHEN "entity_type" = 'project' THEN 'project'::entity_type_enum
    WHEN "entity_type" = 'requirement' THEN 'requirement'::entity_type_enum
    WHEN "entity_type" = 'task' THEN 'task'::entity_type_enum
    WHEN "entity_type" = 'sprint' THEN 'sprint'::entity_type_enum
    WHEN "entity_type" = 'team' THEN 'team'::entity_type_enum
    WHEN "entity_type" = 'document' THEN 'document'::entity_type_enum
    WHEN "entity_type" = 'budget' THEN 'budget'::entity_type_enum
    WHEN "entity_type" = 'approval' THEN 'approval'::entity_type_enum
    WHEN "entity_type" = 'risk' THEN 'risk'::entity_type_enum
    WHEN "entity_type" = 'change_request' THEN 'change_request'::entity_type_enum
    ELSE 'project'::entity_type_enum
END;

ALTER TABLE "activity_logs" ALTER COLUMN "action_new" SET NOT NULL;
ALTER TABLE "activity_logs" DROP COLUMN "action";
ALTER TABLE "activity_logs" RENAME COLUMN "action_new" TO "action";
ALTER TABLE "activity_logs" ALTER COLUMN "entity_type_new" SET NOT NULL;
ALTER TABLE "activity_logs" DROP COLUMN "entity_type";
ALTER TABLE "activity_logs" RENAME COLUMN "entity_type_new" TO "entity_type";

-- 13. Modify notifications table: change type from text to enum
ALTER TABLE "notifications" ADD COLUMN "type_new" "notification_type";
UPDATE "notifications" SET "type_new" = CASE
    WHEN "type" = 'task' THEN 'task'::notification_type
    WHEN "type" = 'sprint' THEN 'sprint'::notification_type
    WHEN "type" = 'approval' THEN 'approval'::notification_type
    WHEN "type" = 'document' THEN 'document'::notification_type
    WHEN "type" = 'budget' THEN 'budget'::notification_type
    WHEN "type" = 'system' THEN 'system'::notification_type
    ELSE 'system'::notification_type
END;
ALTER TABLE "notifications" ALTER COLUMN "type_new" SET NOT NULL;
ALTER TABLE "notifications" DROP COLUMN "type";
ALTER TABLE "notifications" RENAME COLUMN "type_new" TO "type";

-- 14. Modify invitations table: add organization_id, expires_at
ALTER TABLE "invitations" ADD COLUMN "organization_id" uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid;
ALTER TABLE "invitations" ADD COLUMN "expires_at" timestamp with time zone;
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "idx_invitations_organization_id_email" ON "invitations" USING btree ("organization_id" uuid_ops, "email" text_ops);

-- 15. Create budget_line_items table
CREATE TABLE "budget_line_items" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "project_id" uuid NOT NULL,
    "category" text NOT NULL,
    "allocated" numeric(12,2) NOT NULL,
    "spent" numeric(12,2) DEFAULT '0' NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "budget_line_items" ADD CONSTRAINT "budget_line_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "idx_budget_line_items_project_id" ON "budget_line_items" USING btree ("project_id" uuid_ops);
CREATE UNIQUE INDEX "budget_line_items_project_id_category_key" ON "budget_line_items" USING btree ("project_id", "category");

-- 16. Create contracts table
CREATE TABLE "contracts" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "project_id" uuid NOT NULL,
    "name" text NOT NULL,
    "vendor" text NOT NULL,
    "value" numeric(12,2) NOT NULL,
    "status" "contract_status" DEFAULT 'pending' NOT NULL,
    "expiry" date,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "idx_contracts_project_id" ON "contracts" USING btree ("project_id" uuid_ops);

-- 17. Create approvals table
CREATE TABLE "approvals" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "project_id" uuid NOT NULL,
    "title" text NOT NULL,
    "requester_id" uuid,
    "type" "approval_type" NOT NULL,
    "status" "approval_status" DEFAULT 'pending' NOT NULL,
    "target_type" text,
    "target_id" uuid,
    "notes" text,
    "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
    "decided_at" timestamp with time zone,
    "decided_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "idx_approvals_project_id" ON "approvals" USING btree ("project_id" uuid_ops);
CREATE INDEX "idx_approvals_status" ON "approvals" USING btree ("status" enum_ops);

-- 18. Create risks table
CREATE TABLE "risks" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "project_id" uuid NOT NULL,
    "title" text NOT NULL,
    "probability" "risk_level" NOT NULL,
    "impact" "risk_level" NOT NULL,
    "owner_id" uuid,
    "mitigation" text,
    "status" "risk_status" DEFAULT 'open' NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "risks" ADD CONSTRAINT "risks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "risks" ADD CONSTRAINT "risks_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "idx_risks_project_id" ON "risks" USING btree ("project_id" uuid_ops);

-- 19. Create change_requests table
CREATE TABLE "change_requests" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "display_id" text,
    "project_id" uuid NOT NULL,
    "title" text NOT NULL,
    "description" text,
    "type" "change_request_type" NOT NULL,
    "impact" "priority_level" NOT NULL,
    "status" "change_request_status" DEFAULT 'pending' NOT NULL,
    "requester_id" uuid,
    "requester_name" text,
    "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
    "decided_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "idx_change_requests_project_id" ON "change_requests" USING btree ("project_id" uuid_ops);
CREATE INDEX "idx_change_requests_display_id" ON "change_requests" USING btree ("display_id" text_ops);

-- 20. Create milestones table
CREATE TABLE "milestones" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "project_id" uuid NOT NULL,
    "name" text NOT NULL,
    "target_date" date NOT NULL,
    "completed" boolean DEFAULT false NOT NULL,
    "completed_at" timestamp with time zone,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "idx_milestones_project_id" ON "milestones" USING btree ("project_id" uuid_ops);

-- 21. Create folders table
CREATE TABLE "folders" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "project_id" uuid NOT NULL,
    "parent_id" uuid,
    "name" text NOT NULL,
    "created_by" uuid NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "folders" ADD CONSTRAINT "folders_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "folders" ADD CONSTRAINT "folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "folders" ADD CONSTRAINT "folders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
CREATE INDEX "idx_folders_project_id" ON "folders" USING btree ("project_id" uuid_ops);
CREATE INDEX "idx_folders_parent_id" ON "folders" USING btree ("parent_id" uuid_ops);
CREATE UNIQUE INDEX "folders_project_id_parent_id_name_key" ON "folders" USING btree ("project_id", "parent_id", "name");

-- 22. Create documents table
CREATE TABLE "documents" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "project_id" uuid NOT NULL,
    "folder_id" uuid,
    "name" text NOT NULL,
    "file_type" "document_type" NOT NULL,
    "file_size" bigint NOT NULL,
    "storage_path" text NOT NULL,
    "storage_bucket" text DEFAULT 'project-documents' NOT NULL,
    "owner_id" uuid NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "parent_version_id" uuid,
    "is_latest" boolean DEFAULT true NOT NULL,
    "description" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "documents" ADD CONSTRAINT "documents_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "documents" ADD CONSTRAINT "documents_parent_version_id_fkey" FOREIGN KEY ("parent_version_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "idx_documents_project_id" ON "documents" USING btree ("project_id" uuid_ops);
CREATE INDEX "idx_documents_folder_id" ON "documents" USING btree ("folder_id" uuid_ops);
CREATE INDEX "idx_documents_owner_id" ON "documents" USING btree ("owner_id" uuid_ops);
CREATE INDEX "idx_documents_project_folder" ON "documents" USING btree ("project_id" uuid_ops, "folder_id" uuid_ops);

-- 23. Create user_preferences table
CREATE TABLE "user_preferences" (
    "user_id" uuid PRIMARY KEY NOT NULL,
    "theme" text DEFAULT 'light' NOT NULL,
    "sidebar_collapsed" boolean DEFAULT false NOT NULL,
    "notification_preferences" jsonb DEFAULT '{}' NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;