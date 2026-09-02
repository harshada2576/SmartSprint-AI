import { pgTable, foreignKey, uuid, text, timestamp, unique, uniqueIndex, index, check, integer, date, numeric, jsonb, boolean, primaryKey, pgEnum, bigint } from "drizzle-orm/pg-core"
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

export const documentType = pgEnum("document_type", ['pdf', 'doc', 'image', 'code', 'spreadsheet', 'other'])
export const contractStatus = pgEnum("contract_status", ['active', 'pending', 'expired', 'terminated'])
export const approvalType = pgEnum("approval_type", ['scope', 'budget', 'vendor', 'resource'])
export const approvalStatus = pgEnum("approval_status", ['pending', 'approved', 'rejected'])
export const riskLevel = pgEnum("risk_level", ['high', 'medium', 'low'])
export const riskStatus = pgEnum("risk_status", ['open', 'mitigated', 'closed'])
export const changeRequestType = pgEnum("change_request_type", ['feature', 'technical', 'process'])
export const changeRequestStatus = pgEnum("change_request_status", ['pending', 'approved', 'rejected'])
export const activityAction = pgEnum("activity_action", ['created', 'updated', 'deleted', 'approved', 'rejected', 'completed', 'assigned', 'commented'])
export const entityTypeEnum = pgEnum("entity_type_enum", ['project', 'requirement', 'task', 'sprint', 'team', 'document', 'budget', 'approval', 'risk', 'change_request'])
export const notificationType = pgEnum("notification_type", ['task', 'sprint', 'approval', 'document', 'budget', 'system'])

export const organizations = pgTable("organizations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	slug: text().notNull(),
	industry: text(),
	timezone: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("organizations_slug_key").on(table.slug),
])

export const organizationMembers = pgTable("organization_members", {
	organizationId: uuid("organization_id").notNull(),
	userId: uuid("user_id").notNull(),
	role: userRole().default('DEVELOPER').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
		columns: [table.organizationId],
		foreignColumns: [organizations.id],
		name: "organization_members_organization_id_fkey"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.userId],
		foreignColumns: [users.id],
		name: "organization_members_user_id_fkey"
	}).onDelete("cascade"),
	primaryKey({ columns: [table.organizationId, table.userId], name: "organization_members_pkey" }),
	index("idx_organization_members_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
])

export const users = pgTable("users", {
	id: uuid().primaryKey().notNull(),
	firstName: text("first_name").notNull(),
	lastName: text("last_name").notNull(),
	email: text().notNull(),
	department: text(),
	jobTitle: text("job_title"),
	status: userStatus().default('active').notNull(),
	avatarInitials: text("avatar_initials"),
	avatarUrl: text("avatar_url"),
	lastActiveAt: timestamp("last_active_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("users_email_key").on(table.email),
])

export const teams = pgTable("teams", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id").notNull(),
	name: text().notNull(),
	leadId: uuid("lead_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
		columns: [table.organizationId],
		foreignColumns: [organizations.id],
		name: "teams_organization_id_fkey"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.leadId],
		foreignColumns: [users.id],
		name: "teams_lead_id_fkey"
	}).onDelete("set null"),
	index("idx_teams_organization_id").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops")),
])

export const projects = pgTable("projects", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id").notNull(),
	name: text().notNull(),
	code: text(),
	description: text(),
	client: text(),
	managerId: uuid("manager_id"),
	method: projectMethod().default('scrum').notNull(),
	status: projectStatus().default('pending').notNull(),
	priority: priorityLevel().default('medium').notNull(),
	progress: integer().default(0).notNull(),
	startDate: date("start_date"),
	endDate: date("end_date"),
	budgetTotal: numeric("budget_total", { precision: 12, scale: 2 }),
	budgetCurrency: text("budget_currency").default('USD'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_projects_manager_id").using("btree", table.managerId.asc().nullsLast().op("uuid_ops")),
	index("idx_projects_organization_id").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("idx_projects_org_code").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops"), table.code.asc().nullsLast().op("text_ops")),
	index("idx_projects_code").using("btree", table.code.asc().nullsLast().op("text_ops")),
	foreignKey({
		columns: [table.organizationId],
		foreignColumns: [organizations.id],
		name: "projects_organization_id_fkey"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.managerId],
		foreignColumns: [users.id],
		name: "projects_manager_id_fkey"
	}).onDelete("set null"),
	check("projects_progress_check", sql`(progress >= 0) AND (progress <= 100)`),
])

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
	index("idx_sprints_project_id").using("btree", table.projectId.asc().nullsLast().op("uuid_ops")),
])

export const requirements = pgTable("requirements", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	displayId: text("display_id").notNull(),
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
	unique("requirements_display_id_key").on(table.projectId, table.displayId),
])

export const backlog = pgTable("backlog", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	projectId: uuid("project_id").notNull(),
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
	index("idx_backlog_project_id").using("btree", table.projectId.asc().nullsLast().op("uuid_ops")),
])

export const tasks = pgTable("tasks", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	displayId: text("display_id").notNull(),
	sprintId: uuid("sprint_id"),
	requirementId: uuid("requirement_id"),
	projectId: uuid("project_id").notNull(),
	title: text().notNull(),
	description: text(),
	priority: priorityLevel().default('medium').notNull(),
	points: integer(),
	assigneeId: uuid("assignee_id"),
	columnStatus: taskColumnStatus("column_status").default('backlog').notNull(),
	dueDate: date("due_date"),
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
	unique("tasks_display_id_key").on(table.projectId, table.displayId),
])

export const aiPredictions = pgTable("ai_predictions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	requirementId: uuid("requirement_id").notNull(),
	suggestedPriority: priorityLevel("suggested_priority"),
	suggestedSprintId: uuid("suggested_sprint_id"),
	confidenceScore: numeric("confidence_score", { precision: 5, scale: 2 }),
	summary: text(),
	reasoning: jsonb(),
	recommendationStatus: recommendationStatus("recommendation_status").default('pending').notNull(),
	approvedBy: uuid("approved_by"),
	approvedAt: timestamp("approved_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
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
	foreignKey({
		columns: [table.approvedBy],
		foreignColumns: [users.id],
		name: "ai_predictions_approved_by_fkey"
	}).onDelete("set null"),
	check("ai_predictions_confidence_score_check", sql`(confidence_score >= (0)::numeric) AND (confidence_score <= (100)::numeric)`),
	index("idx_ai_predictions_recommendation_status").using("btree", table.recommendationStatus.asc().nullsLast().op("enum_ops")),
])

export const activityLogs = pgTable("activity_logs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id"),
	projectId: uuid("project_id"),
	userId: uuid("user_id"),
	action: activityAction().notNull(),
	value: text(),
	entityType: entityTypeEnum("entity_type"),
	entityId: uuid("entity_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_activity_logs_project_id").using("btree", table.projectId.asc().nullsLast().op("uuid_ops")),
	index("idx_activity_logs_organization_id").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
		columns: [table.organizationId],
		foreignColumns: [organizations.id],
		name: "activity_logs_organization_id_fkey"
	}).onDelete("set null"),
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
])

export const notifications = pgTable("notifications", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	type: notificationType().notNull(),
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
])

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
	primaryKey({ columns: [table.teamId, table.userId], name: "team_members_pkey" }),
])

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
	primaryKey({ columns: [table.projectId, table.userId], name: "project_members_pkey" }),
])

export const invitations = pgTable("invitations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id").notNull(),
	email: text().notNull(),
	role: userRole().notNull(),
	status: invitationStatus().default('pending').notNull(),
	invitedBy: uuid("invited_by"),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
		columns: [table.organizationId],
		foreignColumns: [organizations.id],
		name: "invitations_organization_id_fkey"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.invitedBy],
		foreignColumns: [users.id],
		name: "invitations_invited_by_fkey"
	}).onDelete("set null"),
	index("idx_invitations_organization_id_email").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops"), table.email.asc().nullsLast().op("text_ops")),
])

export const budgetLineItems = pgTable("budget_line_items", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	projectId: uuid("project_id").notNull(),
	category: text().notNull(),
	allocated: numeric({ precision: 12, scale: 2 }).notNull(),
	spent: numeric({ precision: 12, scale: 2 }).default('0').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
		columns: [table.projectId],
		foreignColumns: [projects.id],
		name: "budget_line_items_project_id_fkey"
	}).onDelete("cascade"),
	index("idx_budget_line_items_project_id").using("btree", table.projectId.asc().nullsLast().op("uuid_ops")),
	unique("budget_line_items_project_id_category_key").on(table.projectId, table.category),
])

export const contracts = pgTable("contracts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	projectId: uuid("project_id").notNull(),
	name: text().notNull(),
	vendor: text().notNull(),
	value: numeric({ precision: 12, scale: 2 }).notNull(),
	status: contractStatus().default('pending').notNull(),
	expiry: date(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
		columns: [table.projectId],
		foreignColumns: [projects.id],
		name: "contracts_project_id_fkey"
	}).onDelete("cascade"),
	index("idx_contracts_project_id").using("btree", table.projectId.asc().nullsLast().op("uuid_ops")),
])

export const approvals = pgTable("approvals", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	projectId: uuid("project_id").notNull(),
	title: text().notNull(),
	requesterId: uuid("requester_id"),
	type: approvalType().notNull(),
	status: approvalStatus().default('pending').notNull(),
	targetType: text("target_type"),
	targetId: uuid("target_id"),
	notes: text(),
	requestedAt: timestamp("requested_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	decidedAt: timestamp("decided_at", { withTimezone: true, mode: 'string' }),
	decidedBy: uuid("decided_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
		columns: [table.projectId],
		foreignColumns: [projects.id],
		name: "approvals_project_id_fkey"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.requesterId],
		foreignColumns: [users.id],
		name: "approvals_requester_id_fkey"
	}).onDelete("set null"),
	foreignKey({
		columns: [table.decidedBy],
		foreignColumns: [users.id],
		name: "approvals_decided_by_fkey"
	}).onDelete("set null"),
	index("idx_approvals_project_id").using("btree", table.projectId.asc().nullsLast().op("uuid_ops")),
	index("idx_approvals_status").using("btree", table.status.asc().nullsLast().op("enum_ops")),
])

export const risks = pgTable("risks", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	projectId: uuid("project_id").notNull(),
	title: text().notNull(),
	probability: riskLevel().notNull(),
	impact: riskLevel().notNull(),
	ownerId: uuid("owner_id"),
	mitigation: text(),
	status: riskStatus().default('open').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
		columns: [table.projectId],
		foreignColumns: [projects.id],
		name: "risks_project_id_fkey"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.ownerId],
		foreignColumns: [users.id],
		name: "risks_owner_id_fkey"
	}).onDelete("set null"),
	index("idx_risks_project_id").using("btree", table.projectId.asc().nullsLast().op("uuid_ops")),
])

export const changeRequests = pgTable("change_requests", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	displayId: text("display_id"),
	projectId: uuid("project_id").notNull(),
	title: text().notNull(),
	description: text(),
	type: changeRequestType().notNull(),
	impact: priorityLevel().notNull(),
	status: changeRequestStatus().default('pending').notNull(),
	requesterId: uuid("requester_id"),
	requesterName: text("requester_name"),
	requestedAt: timestamp("requested_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	decidedAt: timestamp("decided_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
		columns: [table.projectId],
		foreignColumns: [projects.id],
		name: "change_requests_project_id_fkey"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.requesterId],
		foreignColumns: [users.id],
		name: "change_requests_requester_id_fkey"
	}).onDelete("set null"),
	index("idx_change_requests_project_id").using("btree", table.projectId.asc().nullsLast().op("uuid_ops")),
	index("idx_change_requests_display_id").using("btree", table.displayId.asc().nullsLast().op("text_ops")),
])

export const milestones = pgTable("milestones", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	projectId: uuid("project_id").notNull(),
	name: text().notNull(),
	targetDate: date("target_date").notNull(),
	completed: boolean().default(false).notNull(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	sortOrder: integer("sort_order").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
		columns: [table.projectId],
		foreignColumns: [projects.id],
		name: "milestones_project_id_fkey"
	}).onDelete("cascade"),
	index("idx_milestones_project_id").using("btree", table.projectId.asc().nullsLast().op("uuid_ops")),
])

export const folders = pgTable("folders", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	projectId: uuid("project_id").notNull(),
	parentId: uuid("parent_id"),
	name: text().notNull(),
	createdBy: uuid("created_by").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
		columns: [table.projectId],
		foreignColumns: [projects.id],
		name: "folders_project_id_fkey"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.parentId],
		foreignColumns: [table.id],
		name: "folders_parent_id_fkey"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.createdBy],
		foreignColumns: [users.id],
		name: "folders_created_by_fkey"
	}).onDelete("restrict"),
	index("idx_folders_project_id").using("btree", table.projectId.asc().nullsLast().op("uuid_ops")),
	index("idx_folders_parent_id").using("btree", table.parentId.asc().nullsLast().op("uuid_ops")),
	unique("folders_project_id_parent_id_name_key").on(table.projectId, table.parentId, table.name),
])

export const documents = pgTable("documents", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	projectId: uuid("project_id").notNull(),
	folderId: uuid("folder_id"),
	name: text().notNull(),
	fileType: documentType("file_type").notNull(),
	fileSize: bigint("file_size", { mode: "number" }).notNull(),
	storagePath: text("storage_path").notNull(),
	storageBucket: text("storage_bucket").default('project-documents').notNull(),
	ownerId: uuid("owner_id").notNull(),
	version: integer().default(1).notNull(),
	parentVersionId: uuid("parent_version_id"),
	isLatest: boolean("is_latest").default(true).notNull(),
	description: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
		columns: [table.projectId],
		foreignColumns: [projects.id],
		name: "documents_project_id_fkey"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.folderId],
		foreignColumns: [folders.id],
		name: "documents_folder_id_fkey"
	}).onDelete("set null"),
	foreignKey({
		columns: [table.ownerId],
		foreignColumns: [users.id],
		name: "documents_owner_id_fkey"
	}).onDelete("restrict"),
	foreignKey({
		columns: [table.parentVersionId],
		foreignColumns: [table.id],
		name: "documents_parent_version_id_fkey"
	}).onDelete("set null"),
	index("idx_documents_project_id").using("btree", table.projectId.asc().nullsLast().op("uuid_ops")),
	index("idx_documents_folder_id").using("btree", table.folderId.asc().nullsLast().op("uuid_ops")),
	index("idx_documents_owner_id").using("btree", table.ownerId.asc().nullsLast().op("uuid_ops")),
	index("idx_documents_project_folder").using("btree", table.projectId.asc().nullsLast().op("uuid_ops"), table.folderId.asc().nullsLast().op("uuid_ops")),
])

export const userPreferences = pgTable("user_preferences", {
	userId: uuid("user_id").notNull(),
	theme: text().default('light').notNull(),
	sidebarCollapsed: boolean("sidebar_collapsed").default(false).notNull(),
	notificationPreferences: jsonb("notification_preferences").default('{}').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
		columns: [table.userId],
		foreignColumns: [users.id],
		name: "user_preferences_user_id_fkey"
	}).onDelete("cascade"),
	primaryKey({ columns: [table.userId], name: "user_preferences_pkey" }),
])