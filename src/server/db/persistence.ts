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

export async function loadWorkspaceDatabaseFromPostgres(tenant: AuthenticatedTenant): Promise<import("sql.js").Database> {
  const workspaceId = requireWorkspace(tenant);
  const rows = await withTenantTransaction(tenant, async (tx) => {
    const products = await tx.select().from(schema.workspaceProduct)
      .where(and(eq(schema.workspaceProduct.organizationId, tenant.organizationId), eq(schema.workspaceProduct.workspaceId, workspaceId)));
    const sales = await tx.select().from(schema.workspaceSale)
      .where(and(eq(schema.workspaceSale.organizationId, tenant.organizationId), eq(schema.workspaceSale.workspaceId, workspaceId)));
    const saleItems = await tx.select().from(schema.workspaceSaleItem)
      .where(and(eq(schema.workspaceSaleItem.organizationId, tenant.organizationId), eq(schema.workspaceSaleItem.workspaceId, workspaceId)));
    return { products, sales, saleItems };
  });

  const { getSqlEngine } = await import("../../engine/workspace-manager");
  const { SCHEMA_SQL } = await import("../../engine/schema");
  const SQL = await getSqlEngine();
  const db = new SQL.Database();
  try {
  db.run(SCHEMA_SQL);

  for (const p of rows.products) {
    const stmt = db.prepare("INSERT INTO products (id, name, category) VALUES ($id, $name, $category)");
    try {
      stmt.bind({ $id: p.id, $name: p.name, $category: p.category });
      stmt.step();
    } finally {
      stmt.free();
    }
  }

  for (const s of rows.sales) {
    const stmt = db.prepare("INSERT INTO sales (id, order_date, status) VALUES ($id, $orderDate, $status)");
    try {
      stmt.bind({ $id: s.id, $orderDate: s.orderDate, $status: s.status });
      stmt.step();
    } finally {
      stmt.free();
    }
  }

  for (const item of rows.saleItems) {
    const stmt = db.prepare("INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, unit_cost, discount) VALUES ($id, $saleId, $productId, $quantity, $unitPrice, $unitCost, $discount)");
    try {
      stmt.bind({
        $id: item.id,
        $saleId: item.saleId,
        $productId: item.productId,
        $quantity: item.quantity,
        $unitPrice: item.unitPrice,
        $unitCost: item.unitCost,
        $discount: item.discount
      });
      stmt.step();
    } finally {
      stmt.free();
    }
  }

  db.run("PRAGMA query_only = ON");
  return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export async function getPersistedWorkspaceSnapshot(tenant: AuthenticatedTenant): Promise<import("../../components/dashboard/types").DemoSnapshot> {
  const db = await loadWorkspaceDatabaseFromPostgres(tenant);
  try {
    const { computeSnapshotFromDb } = await import("../../engine/workspace-manager");
    return computeSnapshotFromDb(db, false);
  } finally {
    db.close();
  }
}

export async function persistWorkspaceProduct(
  tenant: AuthenticatedTenant,
  params: import("../../engine/workspace-manager").AddProductParams
): Promise<import("../../components/dashboard/types").ProductSnapshot> {
  if (tenant.role === "viewer") {
    throw new Error("This organization role does not grant permission to modify workspace data.");
  }
  const workspaceId = requireWorkspace(tenant);
  const productId = params.id || `P-${randomUUID()}`;
  const productName = params.name.trim();
  const category = params.category.trim() || "General";

  await withTenantTransaction(tenant, async (tx) => {
    const [createdProduct] = await tx.insert(schema.workspaceProduct).values({
      id: productId,
      organizationId: tenant.organizationId,
      workspaceId,
      name: productName,
      category
    }).onConflictDoNothing().returning({ id: schema.workspaceProduct.id });
    if (!createdProduct) {
      const [existing] = await tx.select({ name: schema.workspaceProduct.name, category: schema.workspaceProduct.category })
        .from(schema.workspaceProduct)
        .where(and(
          eq(schema.workspaceProduct.id, productId),
          eq(schema.workspaceProduct.organizationId, tenant.organizationId),
          eq(schema.workspaceProduct.workspaceId, workspaceId)
        ))
        .limit(1);
      if (!existing || existing.name !== productName || existing.category !== category) {
        throw new Error("A product with this ID already exists in the selected workspace with different details.");
      }
    }

    const quantity = params.quantity && params.quantity > 0 ? params.quantity : 0;
    const unitPrice = params.price && params.price >= 0 ? params.price : 0;
    const unitCost = params.cost && params.cost >= 0 ? params.cost : 0;
    const orderDate = params.orderDate || "2026-10-15";

    if (quantity > 0 && unitPrice > 0) {
      const saleId = `S-${randomUUID()}`;
      await tx.insert(schema.workspaceSale).values({
        id: saleId,
        organizationId: tenant.organizationId,
        workspaceId,
        orderDate,
        status: "completed"
      });

      const itemId = `I-${randomUUID()}`;
      await tx.insert(schema.workspaceSaleItem).values({
        id: itemId,
        organizationId: tenant.organizationId,
        workspaceId,
        saleId,
        productId,
        quantity,
        unitPrice,
        unitCost,
        discount: 0
      });
    }
  });

  const snapshot = await getPersistedWorkspaceSnapshot(tenant);
  const found = snapshot.products.find((p) => p.productId === productId);
  if (found) return found;

  return {
    productId,
    productName,
    category,
    q3Revenue: 0,
    q4Revenue: (params.quantity || 0) * (params.price || 0),
    q3Margin: 0,
    q4Margin: (params.price || 0) > 0 ? (((params.price || 0) - (params.cost || 0)) / (params.price || 0)) * 100 : 0,
    marginChange: 0,
    q3UnitCost: 0,
    q4UnitCost: params.cost || 0,
    q3NetPrice: 0,
    q4NetPrice: params.price || 0,
    q3Units: 0,
    q4Units: params.quantity || 0,
    status: "new"
  };
}

export async function getPersistedWorkspaceProducts(tenant: AuthenticatedTenant): Promise<import("../../components/dashboard/types").ProductSnapshot[]> {
  const snapshot = await getPersistedWorkspaceSnapshot(tenant);
  return snapshot.products;
}

export async function getPersistedWorkspaceProductDetail(
  tenant: AuthenticatedTenant,
  productId: string
): Promise<import("../../components/dashboard/types").ProductSnapshot | null> {
  const snapshot = await getPersistedWorkspaceSnapshot(tenant);
  return snapshot.products.find((p) => p.productId === productId) ?? null;
}

export async function updateWorkspaceProduct(
  tenant: AuthenticatedTenant,
  productId: string,
  updates: { name?: string; category?: string }
): Promise<void> {
  if (tenant.role === "viewer") {
    throw new Error("This organization role does not grant permission to modify workspace data.");
  }
  const workspaceId = requireWorkspace(tenant);
  await withTenantTransaction(tenant, async (tx) => {
    await tx.update(schema.workspaceProduct)
      .set({
        ...(updates.name ? { name: updates.name.trim() } : {}),
        ...(updates.category ? { category: updates.category.trim() } : {})
      })
      .where(and(
        eq(schema.workspaceProduct.id, productId),
        eq(schema.workspaceProduct.organizationId, tenant.organizationId),
        eq(schema.workspaceProduct.workspaceId, workspaceId)
      ));
  });
}

export async function deleteWorkspaceProduct(
  tenant: AuthenticatedTenant,
  productId: string
): Promise<void> {
  if (tenant.role === "viewer") {
    throw new Error("This organization role does not grant permission to modify workspace data.");
  }
  const workspaceId = requireWorkspace(tenant);
  await withTenantTransaction(tenant, async (tx) => {
    await tx.delete(schema.workspaceProduct)
      .where(and(
        eq(schema.workspaceProduct.id, productId),
        eq(schema.workspaceProduct.organizationId, tenant.organizationId),
        eq(schema.workspaceProduct.workspaceId, workspaceId)
      ));
  });
}
