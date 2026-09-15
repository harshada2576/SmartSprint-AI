import { relations } from "drizzle-orm/relations";
import { users, invitations,  teams, projects, sprints, requirements, backlog, tasks, aiPredictions, activityLogs, notifications, teamMembers, projectMembers } from "../schema";

export const invitationsRelations = relations(invitations, ({one}) => ({
	user: one(users, {
		fields: [invitations.invitedBy],
		references: [users.id]
	}),
}));

export const usersRelations = relations(users, ({one, many}) => ({
	invitations: many(invitations),
	
	teams: many(teams),
	projects: many(projects),
	requirements: many(requirements),
	tasks: many(tasks),
	activityLogs: many(activityLogs),
	notifications: many(notifications),
	teamMembers: many(teamMembers),
	projectMembers: many(projectMembers),
}));



export const teamsRelations = relations(teams, ({one, many}) => ({
	user: one(users, {
		fields: [teams.leadId],
		references: [users.id]
	}),
	teamMembers: many(teamMembers),
}));

export const projectsRelations = relations(projects, ({one, many}) => ({
	user: one(users, {
		fields: [projects.managerId],
		references: [users.id]
	}),
	sprints: many(sprints),
	requirements: many(requirements),
	backlogs: many(backlog),
	tasks: many(tasks),
	activityLogs: many(activityLogs),
	projectMembers: many(projectMembers),
}));

export const sprintsRelations = relations(sprints, ({one, many}) => ({
	project: one(projects, {
		fields: [sprints.projectId],
		references: [projects.id]
	}),
	requirements: many(requirements),
	tasks: many(tasks),
	aiPredictions: many(aiPredictions),
}));

export const requirementsRelations = relations(requirements, ({one, many}) => ({
	user: one(users, {
		fields: [requirements.assigneeId],
		references: [users.id]
	}),
	requirement: one(requirements, {
		fields: [requirements.dependencyId],
		references: [requirements.id],
		relationName: "requirements_dependencyId_requirements_id"
	}),
	requirements: many(requirements, {
		relationName: "requirements_dependencyId_requirements_id"
	}),
	project: one(projects, {
		fields: [requirements.projectId],
		references: [projects.id]
	}),
	sprint: one(sprints, {
		fields: [requirements.sprintId],
		references: [sprints.id]
	}),
	backlogs: many(backlog),
	tasks: many(tasks),
	aiPredictions: many(aiPredictions),
}));

export const backlogRelations = relations(backlog, ({one}) => ({
	project: one(projects, {
		fields: [backlog.projectId],
		references: [projects.id]
	}),
	requirement: one(requirements, {
		fields: [backlog.requirementId],
		references: [requirements.id]
	}),
}));

export const tasksRelations = relations(tasks, ({one}) => ({
	user: one(users, {
		fields: [tasks.assigneeId],
		references: [users.id]
	}),
	project: one(projects, {
		fields: [tasks.projectId],
		references: [projects.id]
	}),
	requirement: one(requirements, {
		fields: [tasks.requirementId],
		references: [requirements.id]
	}),
	sprint: one(sprints, {
		fields: [tasks.sprintId],
		references: [sprints.id]
	}),
}));

export const aiPredictionsRelations = relations(aiPredictions, ({one}) => ({
	requirement: one(requirements, {
		fields: [aiPredictions.requirementId],
		references: [requirements.id]
	}),
	sprint: one(sprints, {
		fields: [aiPredictions.suggestedSprintId],
		references: [sprints.id]
	}),
}));

export const activityLogsRelations = relations(activityLogs, ({one}) => ({
	project: one(projects, {
		fields: [activityLogs.projectId],
		references: [projects.id]
	}),
	user: one(users, {
		fields: [activityLogs.userId],
		references: [users.id]
	}),
}));

export const notificationsRelations = relations(notifications, ({one}) => ({
	user: one(users, {
		fields: [notifications.userId],
		references: [users.id]
	}),
}));

export const teamMembersRelations = relations(teamMembers, ({one}) => ({
	team: one(teams, {
		fields: [teamMembers.teamId],
		references: [teams.id]
	}),
	user: one(users, {
		fields: [teamMembers.userId],
		references: [users.id]
	}),
}));

export const projectMembersRelations = relations(projectMembers, ({one}) => ({
	project: one(projects, {
		fields: [projectMembers.projectId],
		references: [projects.id]
	}),
	user: one(users, {
		fields: [projectMembers.userId],
		references: [users.id]
	}),
}));