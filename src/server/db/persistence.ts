import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { AnalysisResponse, ApprovalAction, AuditEntry } from "../types";
import type { AuthenticatedTenant } from "../auth/session";
import { schema, withTenantTransaction } from "./index";
import { toPendingApprovalItem } from "../storage";

export type PersistedApprovalResult =
  | { success: true; analysis: AnalysisResponse; auditEntry: AuditEntry }
  | { success: false; reason: "not_found" | "conflict"; error: string };

function requireWorkspace(tenant: AuthenticatedTenant) {
  if (!tenant.workspaceId) throw new Error("A verified workspace is required for durable analysis storage.");
  return tenant.workspaceId;
}

export async function persistAnalysis(tenant: AuthenticatedTenant, analysis: AnalysisResponse): Promise<void> {
  const workspaceId = requireWorkspace(tenant);
  await withTenantTransaction(tenant, async (tx) => {
    await tx.insert(schema.analysis).values({
      analysisId: analysis.analysisId,
      organizationId: tenant.organizationId,
      workspaceId,
      createdBy: tenant.userId,
      question: analysis.question,
      status: analysis.status,
      record: analysis
    });
    await tx.insert(schema.analysisApproval).values({
      analysisId: analysis.analysisId,
      organizationId: tenant.organizationId,
      workspaceId,
      status: analysis.approval.status,
      action: analysis.approval.action ?? null,
      reviewerId: null,
      notes: analysis.approval.notes ?? null,
      reviewedAt: null
    });
  });
}

export async function getPersistedAnalysis(tenant: AuthenticatedTenant, analysisId: string) {
  const [row] = await withTenantTransaction(tenant, (tx) => tx.select({ record: schema.analysis.record })
    .from(schema.analysis)
    .where(and(eq(schema.analysis.analysisId, analysisId), eq(schema.analysis.organizationId, tenant.organizationId), eq(schema.analysis.workspaceId, requireWorkspace(tenant))))
    .limit(1));
  return row?.record;
}

export async function listPersistedAnalyses(tenant: AuthenticatedTenant) {
  return withTenantTransaction(tenant, (tx) => tx.select({ record: schema.analysis.record })
    .from(schema.analysis)
    .where(and(eq(schema.analysis.organizationId, tenant.organizationId), eq(schema.analysis.workspaceId, requireWorkspace(tenant))))
    .orderBy(desc(schema.analysis.createdAt)))
    .then((rows) => rows.map((row) => row.record));
}

export async function listPersistedPendingApprovals(tenant: AuthenticatedTenant) {
  const rows = await withTenantTransaction(tenant, (tx) => tx.select({ record: schema.analysis.record })
    .from(schema.analysis)
    .innerJoin(schema.analysisApproval, eq(schema.analysisApproval.analysisId, schema.analysis.analysisId))
    .where(and(
      eq(schema.analysis.organizationId, tenant.organizationId),
      eq(schema.analysis.workspaceId, requireWorkspace(tenant)),
      eq(schema.analysisApproval.status, "pending")
    ))
    .orderBy(desc(schema.analysis.createdAt)));
  return rows.map(({ record }) => toPendingApprovalItem(record));
}

export async function recordPersistedApprovalDecision(
  tenant: AuthenticatedTenant,
  params: { analysisId: string; action: ApprovalAction; notes?: string }
): Promise<PersistedApprovalResult> {
  const workspaceId = requireWorkspace(tenant);
  return withTenantTransaction(tenant, async (tx) => {
    const newStatus = params.action === "approve" ? "approved" : params.action === "reject" ? "rejected" : "changes_requested";
    const now = new Date();
    const [approval] = await tx.update(schema.analysisApproval)
      .set({ status: newStatus, action: params.action, reviewerId: tenant.userId, notes: params.notes ?? null, reviewedAt: now, updatedAt: now })
      .where(and(
        eq(schema.analysisApproval.analysisId, params.analysisId),
        eq(schema.analysisApproval.organizationId, tenant.organizationId),
        eq(schema.analysisApproval.workspaceId, workspaceId),
        eq(schema.analysisApproval.status, "pending")
      ))
      .returning();

    if (!approval) {
      const [existing] = await tx.select({ status: schema.analysisApproval.status })
        .from(schema.analysisApproval)
        .where(and(
          eq(schema.analysisApproval.analysisId, params.analysisId),
          eq(schema.analysisApproval.organizationId, tenant.organizationId),
          eq(schema.analysisApproval.workspaceId, workspaceId)
        )).limit(1);
      if (!existing) return { success: false, reason: "not_found", error: `Analysis with ID '${params.analysisId}' not found.` };
      return { success: false, reason: "conflict", error: `Approval decision conflict: analysis is no longer pending (current status: ${existing.status}).` };
    }

    const [analysisRow] = await tx.select({ record: schema.analysis.record })
      .from(schema.analysis)
      .where(eq(schema.analysis.analysisId, params.analysisId)).limit(1);
    if (!analysisRow) return { success: false, reason: "not_found", error: `Analysis with ID '${params.analysisId}' not found.` };

    const previousStatus = "pending" as const;
    const updatedAnalysis: AnalysisResponse = {
      ...analysisRow.record,
      approval: {
        ...analysisRow.record.approval,
        status: newStatus,
        action: params.action,
        reviewedAt: now.toISOString(),
        reviewedBy: tenant.userId,
        notes: params.notes ?? null
      }
    };
    await tx.update(schema.analysis).set({ record: updatedAnalysis, updatedAt: now }).where(eq(schema.analysis.analysisId, params.analysisId));

    const auditEntry: AuditEntry = {
      id: randomUUID(),
      timestamp: now.toISOString(),
      analysisId: params.analysisId,
      action: params.action,
      previousStatus,
      newStatus,
      reviewedBy: tenant.userId,
      ...(params.notes ? { notes: params.notes } : {})
    };
    await tx.insert(schema.approvalDecision).values({
      id: auditEntry.id,
      analysisId: params.analysisId,
      organizationId: tenant.organizationId,
      workspaceId,
      action: params.action,
      previousStatus,
      newStatus,
      reviewerId: tenant.userId,
      notes: params.notes ?? null,
      createdAt: now
    });
    await tx.insert(schema.auditEvent).values({
      id: auditEntry.id,
      analysisId: params.analysisId,
      organizationId: tenant.organizationId,
      workspaceId,
      eventType: "approval.decided",
      actorUserId: tenant.userId,
      eventData: { action: params.action, previousStatus, newStatus, notes: params.notes ?? null },
      createdAt: now
    });
    return { success: true, analysis: updatedAnalysis, auditEntry };
  });
}

export async function getPersistedAuditHistory(tenant: AuthenticatedTenant, analysisId?: string) {
  const conditions = [
    eq(schema.auditEvent.organizationId, tenant.organizationId),
    eq(schema.auditEvent.workspaceId, requireWorkspace(tenant))
  ];
  if (analysisId) conditions.push(eq(schema.auditEvent.analysisId, analysisId));
  const rows = await withTenantTransaction(tenant, (tx) => tx.select().from(schema.auditEvent)
    .where(and(...conditions)).orderBy(desc(schema.auditEvent.createdAt)));
  return rows.map((row): AuditEntry => ({
    id: row.id,
    timestamp: row.createdAt.toISOString(),
    analysisId: row.analysisId,
    action: row.eventData.action as ApprovalAction,
    previousStatus: row.eventData.previousStatus as AuditEntry["previousStatus"],
    newStatus: row.eventData.newStatus as AuditEntry["newStatus"],
    reviewedBy: row.actorUserId,
    ...(typeof row.eventData.notes === "string" ? { notes: row.eventData.notes } : {})
  }));
}
