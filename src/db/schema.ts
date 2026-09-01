import { pgTable, foreignKey, uuid, text, timestamp, unique, index, check, integer, date, numeric, jsonb, boolean, primaryKey, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const invitationStatus = pgEnum("invitation_status", ['pending', 'expired', 'accepted', 'rejected'])
export const priorityLevel = pgEnum("priority_level", ['high', 'medium', 'low'])
export const projectMethod = pgEnum("project_method", ['scrum', 'kanban', 'waterfall', 'hybrid', 'incremental', 'prototyping', 'spiral', 'agile', 'xp'])
export const projectStatus = pgEnum("project_status", ['active', 'inactive', 'pending', 'completed', 'blocked'])
export const recommendationStatus = pgEnum("recommendation_status", ['pending', 'approved', 'rejected'])
export const requirementCategory = pgEnum("requirement_category", ['feature', 'bug', 'enhancement', 'security', 'uiux', 'performance', 'database', 'api', 'documentation'])
export const requirementStatus = pgEnum("requirement_status", ['draft', 'pending', 'inProgress', 'review', 'testing', 'completed', 'blocked'])
export const sprintStatus = pgEnum("sprint_status", ['planning', 'active', 'completed', 'cancelled'])
export const taskColumnStatus = pgEnum("task_column_status", ['backlog', 'todo', 'inProgress', 'review', 'testing', 'done'])
export const userRole = pgEnum("user_role", ['ADMIN', 'PROJECT_MANAGER', 'DEVELOPER'])
export const userStatus = pgEnum("user_status", ['active', 'inactive'])


export const invitations = pgTable("invitations", {
    id: uuid().defaultRandom().primaryKey().notNull(),
    email: text().notNull(),
    role: userRole().notNull(),
    status: invitationStatus().default('pending').notNull(),
    invitedBy: uuid("invited_by"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
    foreignKey({
            columns: [table.invitedBy],
            foreignColumns: [users.id],
            name: "invitations_invited_by_fkey"
        }).onDelete("set null"),
]);

export const users = pgTable("users", {
    id: uuid().primaryKey().notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text().notNull(),
    role: userRole().default('DEVELOPER').notNull(),
    department: text(),
    status: userStatus().default('active').notNull(),
    avatarInitials: text("avatar_initials"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
    foreignKey({
            columns: [table.id],
            foreignColumns: [table.id],
            name: "users_id_fkey"
        }).onDelete("cascade"),
    unique("users_email_key").on(table.email),
]);

export const teams = pgTable("teams", {
    id: uuid().defaultRandom().primaryKey().notNull(),
    name: text().notNull(),
    leadId: uuid("lead_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
    foreignKey({
            columns: [table.leadId],
            foreignColumns: [users.id],
            name: "teams_lead_id_fkey"
        }).onDelete("set null"),
]);

export const projects = pgTable("projects", {
    id: uuid().defaultRandom().primaryKey().notNull(),
    name: text().notNull(),
    code: text(),
    client: text(),
    managerId: uuid("manager_id"),
    method: projectMethod().default('scrum').notNull(),
    status: projectStatus().default('pending').notNull(),
    priority: priorityLevel().default('medium').notNull(),
    progress: integer().default(0).notNull(),
    endDate: date("end_date"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
    index("idx_projects_manager_id").using("btree", table.managerId.asc().nullsLast().op("uuid_ops")),
    foreignKey({
            columns: [table.managerId],
            foreignColumns: [users.id],
            name: "projects_manager_id_fkey"
        }).onDelete("set null"),
    unique("projects_code_key").on(table.code),
    check("projects_progress_check", sql`(progress >= 0) AND (progress <= 100)`),
]);

export const sprints = pgTable("sprints", {
    id: uuid().defaultRandom().primaryKey().notNull(),
    projectId: uuid("project_id").notNull(),
    name: text().notNull(),
    goal: text(),
    status: sprintStatus().default('planning').notNull(),
    startDate: date("start_date"),
    endDate: date("end_date"),
    totalPoints: integer("total_points"),
    completedPoints: integer("completed_points"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
    foreignKey({
            columns: [table.projectId],
            foreignColumns: [projects.id],
            name: "sprints_project_id_fkey"
        }).onDelete("cascade"),
]);

export const requirements = pgTable("requirements", {
    id: uuid().defaultRandom().primaryKey().notNull(),
    displayId: text("display_id"),
    projectId: uuid("project_id").notNull(),
    title: text().notNull(),
    description: text(),
    category: requirementCategory().notNull(),
    businessValue: priorityLevel("business_value").default('medium').notNull(),
    customerImportance: integer("customer_importance"),
    urgency: integer(),
    complexity: integer(),
    estimatedEffort: integer("estimated_effort"),
    risk: integer(),
    storyPoints: integer("story_points"),
    dependencyId: uuid("dependency_id"),
    priority: priorityLevel().default('medium').notNull(),
    status: requirementStatus().default('draft').notNull(),
    assigneeId: uuid("assignee_id"),
    sprintId: uuid("sprint_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
    index("idx_requirements_assignee_id").using("btree", table.assigneeId.asc().nullsLast().op("uuid_ops")),
    index("idx_requirements_project_id").using("btree", table.projectId.asc().nullsLast().op("uuid_ops")),
    index("idx_requirements_sprint_id").using("btree", table.sprintId.asc().nullsLast().op("uuid_ops")),
    foreignKey({
            columns: [table.assigneeId],
            foreignColumns: [users.id],
            name: "requirements_assignee_id_fkey"
        }).onDelete("set null"),
    foreignKey({
            columns: [table.dependencyId],
            foreignColumns: [table.id],
            name: "requirements_dependency_id_fkey"
        }).onDelete("set null"),
    foreignKey({
            columns: [table.projectId],
            foreignColumns: [projects.id],
            name: "requirements_project_id_fkey"
        }).onDelete("cascade"),
    foreignKey({
            columns: [table.sprintId],
            foreignColumns: [sprints.id],
            name: "requirements_sprint_id_fkey"
        }).onDelete("set null"),
    unique("requirements_display_id_key").on(table.displayId),
]);

export const backlog = pgTable("backlog", {
    id: uuid().defaultRandom().primaryKey().notNull(),
    projectId: uuid("project_id"),
    requirementId: uuid("requirement_id").notNull(),
    rank: integer().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
    foreignKey({
            columns: [table.projectId],
            foreignColumns: [projects.id],
            name: "backlog_project_id_fkey"
        }).onDelete("cascade"),
    foreignKey({
            columns: [table.requirementId],
            foreignColumns: [requirements.id],
            name: "backlog_requirement_id_fkey"
        }).onDelete("cascade"),
    unique("backlog_requirement_id_key").on(table.requirementId),
]);

export const tasks = pgTable("tasks", {
    id: uuid().defaultRandom().primaryKey().notNull(),
    displayId: text("display_id"),
    sprintId: uuid("sprint_id"),
    requirementId: uuid("requirement_id"),
    projectId: uuid("project_id").notNull(),
    title: text().notNull(),
    priority: priorityLevel().default('medium').notNull(),
    points: integer(),
    assigneeId: uuid("assignee_id"),
    columnStatus: taskColumnStatus("column_status").default('backlog').notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
    index("idx_tasks_assignee_id").using("btree", table.assigneeId.asc().nullsLast().op("uuid_ops")),
    index("idx_tasks_project_id").using("btree", table.projectId.asc().nullsLast().op("uuid_ops")),
    index("idx_tasks_sprint_id").using("btree", table.sprintId.asc().nullsLast().op("uuid_ops")),
    foreignKey({
            columns: [table.assigneeId],
            foreignColumns: [users.id],
            name: "tasks_assignee_id_fkey"
        }).onDelete("set null"),
    foreignKey({
            columns: [table.projectId],
            foreignColumns: [projects.id],
            name: "tasks_project_id_fkey"
        }).onDelete("cascade"),
    foreignKey({
            columns: [table.requirementId],
            foreignColumns: [requirements.id],
            name: "tasks_requirement_id_fkey"
        }).onDelete("set null"),
    foreignKey({
            columns: [table.sprintId],
            foreignColumns: [sprints.id],
            name: "tasks_sprint_id_fkey"
        }).onDelete("set null"),
    unique("tasks_display_id_key").on(table.displayId),
]);

export const aiPredictions = pgTable("ai_predictions", {
    id: uuid().defaultRandom().primaryKey().notNull(),
    requirementId: uuid("requirement_id").notNull(),
    suggestedPriority: priorityLevel("suggested_priority"),
    suggestedSprintId: uuid("suggested_sprint_id"),
    confidenceScore: numeric("confidence_score", { precision: 5, scale:  2 }),
    summary: text(),
    reasoning: jsonb(),
    recommendationStatus: recommendationStatus("recommendation_status").default('pending').notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
    foreignKey({
            columns: [table.requirementId],
            foreignColumns: [requirements.id],
            name: "ai_predictions_requirement_id_fkey"
        }).onDelete("cascade"),
    foreignKey({
            columns: [table.suggestedSprintId],
            foreignColumns: [sprints.id],
            name: "ai_predictions_suggested_sprint_id_fkey"
        }).onDelete("set null"),
    check("ai_predictions_confidence_score_check", sql`(confidence_score >= (0)::numeric) AND (confidence_score <= (100)::numeric)`),
]);

export const activityLogs = pgTable("activity_logs", {
    id: uuid().defaultRandom().primaryKey().notNull(),
    projectId: uuid("project_id"),
    userId: uuid("user_id"),
    action: text().notNull(),
    value: text(),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
    index("idx_activity_logs_project_id").using("btree", table.projectId.asc().nullsLast().op("uuid_ops")),
    foreignKey({
            columns: [table.projectId],
            foreignColumns: [projects.id],
            name: "activity_logs_project_id_fkey"
        }).onDelete("set null"),
    foreignKey({
            columns: [table.userId],
            foreignColumns: [users.id],
            name: "activity_logs_user_id_fkey"
        }).onDelete("set null"),
]);

export const notifications = pgTable("notifications", {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid("user_id").notNull(),
    type: text().notNull(),
    title: text().notNull(),
    description: text(),
    priority: priorityLevel().default('medium').notNull(),
    read: boolean().default(false).notNull(),
    actionLabel: text("action_label"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
    index("idx_notifications_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
    foreignKey({
            columns: [table.userId],
            foreignColumns: [users.id],
            name: "notifications_user_id_fkey"
        }).onDelete("cascade"),
]);

export const teamMembers = pgTable("team_members", {
    teamId: uuid("team_id").notNull(),
    userId: uuid("user_id").notNull(),
}, (table) => [
    foreignKey({
            columns: [table.teamId],
            foreignColumns: [teams.id],
            name: "team_members_team_id_fkey"
        }).onDelete("cascade"),
    foreignKey({
            columns: [table.userId],
            foreignColumns: [users.id],
            name: "team_members_user_id_fkey"
        }).onDelete("cascade"),
    primaryKey({ columns: [table.teamId, table.userId], name: "team_members_pkey"}),
]);

export const projectMembers = pgTable("project_members", {
    projectId: uuid("project_id").notNull(),
    userId: uuid("user_id").notNull(),
}, (table) => [
    index("idx_project_members_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
    foreignKey({
            columns: [table.projectId],
            foreignColumns: [projects.id],
            name: "project_members_project_id_fkey"
        }).onDelete("cascade"),
    foreignKey({
            columns: [table.userId],
            foreignColumns: [users.id],
            name: "project_members_user_id_fkey"
        }).onDelete("cascade"),
    primaryKey({ columns: [table.projectId, table.userId], name: "project_members_pkey"}),
]);
