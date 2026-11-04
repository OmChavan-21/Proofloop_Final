import { boolean, foreignKey, index, jsonb, pgSchema, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const authSchema = pgSchema("auth");

export const user = authSchema.table("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
});

export const session = authSchema.table("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  activeOrganizationId: text("active_organization_id")
}, (table) => [index("session_user_id_idx").on(table.userId)]);

export const account = authSchema.table("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
}, (table) => [index("account_user_id_idx").on(table.userId)]);

export const verification = authSchema.table("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
}, (table) => [index("verification_identifier_idx").on(table.identifier)]);

export const organization = authSchema.table("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});

export const member = authSchema.table("member", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
}, (table) => [uniqueIndex("member_org_user_unique").on(table.organizationId, table.userId), index("member_user_id_idx").on(table.userId)]);

export const invitation = authSchema.table("invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role"),
  status: text("status").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  inviterId: text("inviter_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [index("invitation_org_id_idx").on(table.organizationId)]);

export const workspace = pgSchema("app").table("workspace", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [index("workspace_org_id_idx").on(table.organizationId), uniqueIndex("workspace_id_org_unique").on(table.id, table.organizationId)]);

export const workspaceMembership = pgSchema("app").table("workspace_membership", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  organizationId: text("organization_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("workspace_member_unique").on(table.workspaceId, table.userId),
  index("workspace_member_user_id_idx").on(table.userId),
  foreignKey({ columns: [table.workspaceId, table.organizationId], foreignColumns: [workspace.id, workspace.organizationId], name: "workspace_membership_workspace_org_fk" }).onDelete("cascade")
]);

export const analysis = pgSchema("app").table("analysis", {
  analysisId: text("analysis_id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  createdBy: text("created_by").notNull().references(() => user.id, { onDelete: "restrict" }),
  question: text("question").notNull(),
  status: text("status").notNull(),
  record: jsonb("record").notNull().$type<import("../types").AnalysisResponse>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("analysis_id_org_workspace_unique").on(table.analysisId, table.organizationId, table.workspaceId),
  index("analysis_scope_created_idx").on(table.organizationId, table.workspaceId, table.createdAt),
  foreignKey({ columns: [table.workspaceId, table.organizationId], foreignColumns: [workspace.id, workspace.organizationId], name: "analysis_workspace_org_fk" }).onDelete("restrict")
]);

export const analysisApproval = pgSchema("app").table("analysis_approval", {
  analysisId: text("analysis_id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  status: text("status").notNull(),
  action: text("action"),
  reviewerId: text("reviewer_id").references(() => user.id, { onDelete: "restrict" }),
  notes: text("notes"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  foreignKey({ columns: [table.analysisId, table.organizationId, table.workspaceId], foreignColumns: [analysis.analysisId, analysis.organizationId, analysis.workspaceId], name: "analysis_approval_analysis_scope_fk" }).onDelete("restrict"),
  index("analysis_approval_pending_idx").on(table.organizationId, table.workspaceId, table.status)
]);

export const approvalDecision = pgSchema("app").table("approval_decision", {
  id: text("id").primaryKey(),
  analysisId: text("analysis_id").notNull(),
  organizationId: text("organization_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  action: text("action").notNull(),
  previousStatus: text("previous_status").notNull(),
  newStatus: text("new_status").notNull(),
  reviewerId: text("reviewer_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("approval_decision_once_per_analysis").on(table.analysisId),
  foreignKey({ columns: [table.analysisId, table.organizationId, table.workspaceId], foreignColumns: [analysis.analysisId, analysis.organizationId, analysis.workspaceId], name: "approval_decision_analysis_scope_fk" }).onDelete("restrict"),
  index("approval_decision_scope_created_idx").on(table.organizationId, table.workspaceId, table.createdAt)
]);

export const auditEvent = pgSchema("app").table("audit_event", {
  id: text("id").primaryKey(),
  analysisId: text("analysis_id").notNull(),
  organizationId: text("organization_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  eventType: text("event_type").notNull(),
  actorUserId: text("actor_user_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  eventData: jsonb("event_data").notNull().$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  foreignKey({ columns: [table.analysisId, table.organizationId, table.workspaceId], foreignColumns: [analysis.analysisId, analysis.organizationId, analysis.workspaceId], name: "audit_event_analysis_scope_fk" }).onDelete("restrict"),
  index("audit_event_scope_created_idx").on(table.organizationId, table.workspaceId, table.createdAt)
]);
