import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";
import type { AnalysisResponse } from "../types";
import { deleteWorkspaceProduct, getPersistedAnalysis, getPersistedAuditHistory, getPersistedWorkspaceProducts, persistAnalysis, persistWorkspaceProduct, recordPersistedApprovalDecision, updateWorkspaceProduct } from "./persistence";
import { closeDatabasePool } from "./index";
import type { AuthenticatedTenant } from "../auth/session";

const enabled = Boolean(process.env.TEST_DATABASE_URL && process.env.MIGRATION_DATABASE_URL);
const integration = describe.skipIf(!enabled);

integration("PostgreSQL RLS and durable analysis isolation", () => {
  const admin = new pg.Pool({ connectionString: process.env.MIGRATION_DATABASE_URL, max: 1 });
  const app = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
  const suffix = randomUUID();
  const userA = `rls-user-a-${suffix}`;
  const userB = `rls-user-b-${suffix}`;
  const userViewer = `rls-user-viewer-${suffix}`;
  const orgA = `rls-org-a-${suffix}`;
  const orgB = `rls-org-b-${suffix}`;
  const workspaceA = `rls-workspace-a-${suffix}`;
  const workspaceAOther = `rls-workspace-a-other-${suffix}`;
  const workspaceB = `rls-workspace-b-${suffix}`;
  const analysisA = `rls-analysis-a-${suffix}`;
  const analysisAOther = `rls-analysis-a-other-${suffix}`;
  const analysisB = `rls-analysis-b-${suffix}`;
  let fixturesCreated = false;
  const originalDatabaseUrl = process.env.DATABASE_URL;

  const tenantA: AuthenticatedTenant = { userId: userA, organizationId: orgA, role: "analyst", workspaceId: workspaceA };
  const tenantBOwnerInOrgA: AuthenticatedTenant = { userId: userB, organizationId: orgA, role: "owner", workspaceId: workspaceA };

  function sampleAnalysis(analysisId: string): AnalysisResponse {
    return {
      analysisId,
      status: "completed",
      question: "RLS integration fixture",
      sql: "SELECT 1",
      validation: { status: "passed", errors: [] },
      execution: { status: "completed", rowCount: 1 },
      results: [{ value: 1 }],
      evidence: [],
      explanation: { summary: "Integration fixture", findings: [] },
      approval: { status: "pending", recommendations: [] }
    };
  }

  async function seedWorkspaceAsOwner(userId: string, organizationId: string, workspaceId: string, name: string, memberUserId: string) {
    const client = await admin.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.user_id',$1,true), set_config('app.organization_id',$2,true)", [userId, organizationId]);
      await client.query("INSERT INTO app.workspace (id,organization_id,name) VALUES ($1,$2,$3)", [workspaceId, organizationId, name]);
      await client.query("INSERT INTO app.workspace_membership (id,workspace_id,organization_id,user_id) VALUES ($1,$2,$3,$4)", [`wm-${workspaceId}`, workspaceId, organizationId, memberUserId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  afterAll(async () => {
    await closeDatabasePool();
    if (fixturesCreated) {
      const client = await admin.connect();
      try {
        await client.query("BEGIN");
        await client.query("ALTER TABLE app.audit_event DISABLE ROW LEVEL SECURITY");
        await client.query("ALTER TABLE app.approval_decision DISABLE ROW LEVEL SECURITY");
        await client.query("ALTER TABLE app.analysis_approval DISABLE ROW LEVEL SECURITY");
        await client.query("ALTER TABLE app.analysis DISABLE ROW LEVEL SECURITY");
        await client.query("DELETE FROM app.audit_event WHERE analysis_id = ANY($1)", [[analysisA, analysisAOther, analysisB]]);
        await client.query("DELETE FROM app.approval_decision WHERE analysis_id = ANY($1)", [[analysisA, analysisAOther, analysisB]]);
        await client.query("DELETE FROM app.analysis_approval WHERE analysis_id = ANY($1)", [[analysisA, analysisAOther, analysisB]]);
        await client.query("DELETE FROM app.analysis WHERE analysis_id = ANY($1)", [[analysisA, analysisAOther, analysisB]]);
        await client.query("ALTER TABLE app.audit_event ENABLE ROW LEVEL SECURITY");
        await client.query("ALTER TABLE app.audit_event FORCE ROW LEVEL SECURITY");
        await client.query("ALTER TABLE app.approval_decision ENABLE ROW LEVEL SECURITY");
        await client.query("ALTER TABLE app.approval_decision FORCE ROW LEVEL SECURITY");
        await client.query("ALTER TABLE app.analysis_approval ENABLE ROW LEVEL SECURITY");
        await client.query("ALTER TABLE app.analysis_approval FORCE ROW LEVEL SECURITY");
        await client.query("ALTER TABLE app.analysis ENABLE ROW LEVEL SECURITY");
        await client.query("ALTER TABLE app.analysis FORCE ROW LEVEL SECURITY");
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally { client.release(); }

      for (const [userId, organizationId, workspaceId] of [[userB, orgA, workspaceA], [userB, orgA, workspaceAOther], [userB, orgB, workspaceB]]) {
        const cleanupClient = await admin.connect();
        try {
          await cleanupClient.query("BEGIN");
          await cleanupClient.query("ALTER TABLE app.workspace DISABLE ROW LEVEL SECURITY");
          await cleanupClient.query("ALTER TABLE app.workspace_membership DISABLE ROW LEVEL SECURITY");
          await cleanupClient.query("ALTER TABLE app.workspace_sale_item DISABLE ROW LEVEL SECURITY");
          await cleanupClient.query("ALTER TABLE app.workspace_sale DISABLE ROW LEVEL SECURITY");
          await cleanupClient.query("ALTER TABLE app.workspace_product DISABLE ROW LEVEL SECURITY");
          await cleanupClient.query("DELETE FROM app.workspace_sale_item WHERE workspace_id=$1", [workspaceId]);
          await cleanupClient.query("DELETE FROM app.workspace_sale WHERE workspace_id=$1", [workspaceId]);
          await cleanupClient.query("DELETE FROM app.workspace_product WHERE workspace_id=$1", [workspaceId]);
          await cleanupClient.query("DELETE FROM app.workspace_membership WHERE workspace_id=$1", [workspaceId]);
          await cleanupClient.query("DELETE FROM app.workspace WHERE id=$1", [workspaceId]);
          await cleanupClient.query("ALTER TABLE app.workspace_product ENABLE ROW LEVEL SECURITY");
          await cleanupClient.query("ALTER TABLE app.workspace_product FORCE ROW LEVEL SECURITY");
          await cleanupClient.query("ALTER TABLE app.workspace_sale ENABLE ROW LEVEL SECURITY");
          await cleanupClient.query("ALTER TABLE app.workspace_sale FORCE ROW LEVEL SECURITY");
          await cleanupClient.query("ALTER TABLE app.workspace_sale_item ENABLE ROW LEVEL SECURITY");
          await cleanupClient.query("ALTER TABLE app.workspace_sale_item FORCE ROW LEVEL SECURITY");
          await cleanupClient.query("ALTER TABLE app.workspace ENABLE ROW LEVEL SECURITY");
          await cleanupClient.query("ALTER TABLE app.workspace FORCE ROW LEVEL SECURITY");
          await cleanupClient.query("ALTER TABLE app.workspace_membership ENABLE ROW LEVEL SECURITY");
          await cleanupClient.query("ALTER TABLE app.workspace_membership FORCE ROW LEVEL SECURITY");
          await cleanupClient.query("COMMIT");
        } catch (error) {
          await cleanupClient.query("ROLLBACK");
          throw error;
        } finally { cleanupClient.release(); }
        void userId;
        void organizationId;
      }
      await admin.query("DELETE FROM auth.organization WHERE id = ANY($1)", [[orgA, orgB]]);
      await admin.query('DELETE FROM auth."user" WHERE id = ANY($1)', [[userA, userB, userViewer]]);
    }
    await Promise.all([admin.end(), app.end()]);
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it("denies missing-context, cross-workspace, and cross-organization reads; persists approval atomically", async () => {
    const existing = await admin.query("SELECT to_regclass('app.audit_event') AS audit_table");
    expect(existing.rows[0].audit_table).not.toBeNull();

    await admin.query('INSERT INTO auth."user" (id,name,email,email_verified,created_at,updated_at) VALUES ($1,$2,$3,false,now(),now()),($4,$5,$6,false,now(),now()),($7,$8,$9,false,now(),now())', [userA, "RLS A", `${userA}@example.invalid`, userB, "RLS B", `${userB}@example.invalid`, userViewer, "RLS Viewer", `${userViewer}@example.invalid`]);
    await admin.query("INSERT INTO auth.organization (id,name,slug,created_at) VALUES ($1,$2,$3,now()),($4,$5,$6,now())", [orgA, "RLS A", orgA, orgB, "RLS B", orgB]);
    await admin.query("INSERT INTO auth.member (id,organization_id,user_id,role,created_at) VALUES ($1,$2,$3,'analyst',now()),($4,$5,$6,'owner',now()),($7,$8,$9,'owner',now()),($10,$11,$12,'viewer',now())", [`m-a-${suffix}`, orgA, userA, `m-b-a-${suffix}`, orgA, userB, `m-b-b-${suffix}`, orgB, userB, `m-viewer-${suffix}`, orgA, userViewer]);
    fixturesCreated = true;
    await seedWorkspaceAsOwner(userB, orgA, workspaceA, "A", userA);
    {
      const client = await admin.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.user_id',$1,true), set_config('app.organization_id',$2,true), set_config('app.workspace_id',$3,true)", [userB, orgA, workspaceA]);
        await client.query("INSERT INTO app.workspace_membership (id,workspace_id,organization_id,user_id) VALUES ($1,$2,$3,$4)", [`wm-viewer-${suffix}`, workspaceA, orgA, userViewer]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally { client.release(); }
    }
    await seedWorkspaceAsOwner(userB, orgA, workspaceAOther, "A other", userB);
    await seedWorkspaceAsOwner(userB, orgB, workspaceB, "B", userB);

    const roleSql = "SELECT r.rolsuper, r.rolbypassrls, has_schema_privilege(r.rolname,'app','CREATE') AS can_create_app_objects, EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relkind IN ('r','p') AND c.relowner=r.oid) AS owns_app_table FROM pg_roles r WHERE r.rolname=current_user";
    const role = await app.query(roleSql);
    expect(role.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false, can_create_app_objects: false, owns_app_table: false });
    const migrationRole = await admin.query(roleSql);
    expect(migrationRole.rows[0].rolsuper).toBe(false);
    expect(migrationRole.rows[0].rolbypassrls).toBe(false);
    expect(migrationRole.rows[0].can_create_app_objects).toBe(true);
    expect(migrationRole.rows[0].owns_app_table).toBe(true);

    const missingContext = await app.connect();
    try {
      await missingContext.query("BEGIN");
      expect((await missingContext.query("SELECT id FROM app.workspace")).rows).toEqual([]);
      expect((await missingContext.query("SELECT analysis_id FROM app.analysis")).rows).toEqual([]);
      expect((await missingContext.query("SELECT id FROM app.workspace_product")).rows).toEqual([]);
      expect((await missingContext.query("SELECT id FROM app.workspace_sale")).rows).toEqual([]);
      expect((await missingContext.query("SELECT id FROM app.workspace_sale_item")).rows).toEqual([]);
      await missingContext.query("ROLLBACK");
    } finally { missingContext.release(); }

    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    await closeDatabasePool();
    await persistWorkspaceProduct(tenantA, {
      id: `rls-product-${suffix}`,
      name: "Workspace A persistent product",
      category: "Integration",
      price: 50,
      cost: 20,
      quantity: 4,
      orderDate: "2026-10-15"
    });
    expect((await getPersistedWorkspaceProducts(tenantA)).map((product) => product.productId)).toContain(`rls-product-${suffix}`);
    expect(await getPersistedWorkspaceProducts({ ...tenantA, workspaceId: workspaceAOther })).toEqual([]);
    expect(await getPersistedWorkspaceProducts({ ...tenantA, organizationId: orgB, workspaceId: workspaceB })).toEqual([]);
    await expect(persistWorkspaceProduct({ ...tenantA, workspaceId: workspaceAOther }, {
      name: "Unauthorized product", category: "Integration", price: 10, cost: 5, quantity: 1, orderDate: "2026-10-15"
    })).rejects.toThrow();
    await expect(persistWorkspaceProduct({ userId: userViewer, organizationId: orgA, role: "viewer", workspaceId: workspaceA }, {
      name: "Viewer write attempt", category: "Integration", price: 10, cost: 5, quantity: 1, orderDate: "2026-10-15"
    })).rejects.toThrow();
    await expect(updateWorkspaceProduct({ userId: userViewer, organizationId: orgA, role: "viewer", workspaceId: workspaceA }, `rls-product-${suffix}`, {
      name: "Viewer update attempt"
    })).rejects.toThrow();
    await expect(deleteWorkspaceProduct({ userId: userViewer, organizationId: orgA, role: "viewer", workspaceId: workspaceA }, `rls-product-${suffix}`)).rejects.toThrow();

    // Direct SQL checks with application pool: verify RLS enforces read-only for viewer and prevents cross-workspace mutation
    const viewerDirectSql = await app.connect();
    try {
      await viewerDirectSql.query("BEGIN");
      await viewerDirectSql.query("SELECT set_config('app.user_id',$1,true), set_config('app.organization_id',$2,true), set_config('app.workspace_id',$3,true)", [userViewer, orgA, workspaceA]);
      // Viewer CAN read the product in their assigned workspace
      const viewerRead = await viewerDirectSql.query("SELECT id FROM app.workspace_product WHERE id=$1", [`rls-product-${suffix}`]);
      expect(viewerRead.rows).toHaveLength(1);

      // Viewer direct SQL INSERT must fail RLS policy check
      await expect(viewerDirectSql.query(
        "INSERT INTO app.workspace_product (id,organization_id,workspace_id,name,category) VALUES ($1,$2,$3,$4,$5)",
        [`rls-prod-viewer-direct-${suffix}`, orgA, workspaceA, "Viewer Direct Insert", "Hacking"]
      )).rejects.toThrow(/row-level security policy/i);

      // Viewer direct SQL UPDATE must update 0 rows (using USING clause with can_write_business_data)
      const viewerUpdate = await viewerDirectSql.query(
        "UPDATE app.workspace_product SET name = 'Hacked' WHERE id=$1",
        [`rls-product-${suffix}`]
      );
      expect(viewerUpdate.rowCount).toBe(0);

      // Viewer direct SQL DELETE must delete 0 rows
      const viewerDelete = await viewerDirectSql.query(
        "DELETE FROM app.workspace_product WHERE id=$1",
        [`rls-product-${suffix}`]
      );
      expect(viewerDelete.rowCount).toBe(0);

      await viewerDirectSql.query("ROLLBACK");
    } finally { viewerDirectSql.release(); }

    // Direct SQL checks: verify cross-workspace and cross-organization UPDATE and DELETE are blocked by RLS
    const crossScopeSql = await app.connect();
    try {
      await crossScopeSql.query("BEGIN");
      // Connect as userA in workspaceAOther
      await crossScopeSql.query("SELECT set_config('app.user_id',$1,true), set_config('app.organization_id',$2,true), set_config('app.workspace_id',$3,true)", [userA, orgA, workspaceAOther]);
      const otherWsUpdate = await crossScopeSql.query("UPDATE app.workspace_product SET name = 'Cross-WS' WHERE id=$1", [`rls-product-${suffix}`]);
      expect(otherWsUpdate.rowCount).toBe(0);
      const otherWsDelete = await crossScopeSql.query("DELETE FROM app.workspace_product WHERE id=$1", [`rls-product-${suffix}`]);
      expect(otherWsDelete.rowCount).toBe(0);

      // Connect as userB in orgB
      await crossScopeSql.query("SELECT set_config('app.user_id',$1,true), set_config('app.organization_id',$2,true), set_config('app.workspace_id',$3,true)", [userB, orgB, workspaceB]);
      const otherOrgUpdate = await crossScopeSql.query("UPDATE app.workspace_product SET name = 'Cross-Org' WHERE id=$1", [`rls-product-${suffix}`]);
      expect(otherOrgUpdate.rowCount).toBe(0);
      const otherOrgDelete = await crossScopeSql.query("DELETE FROM app.workspace_product WHERE id=$1", [`rls-product-${suffix}`]);
      expect(otherOrgDelete.rowCount).toBe(0);

      await crossScopeSql.query("ROLLBACK");
    } finally { crossScopeSql.release(); }

    await closeDatabasePool();
    expect((await getPersistedWorkspaceProducts(tenantA)).map((product) => product.productId)).toContain(`rls-product-${suffix}`);

    const ownRecord = sampleAnalysis(analysisA);
    const otherWorkspaceRecord = sampleAnalysis(analysisAOther);
    const otherOrganizationRecord = sampleAnalysis(analysisB);
    await persistAnalysis(tenantA, ownRecord);
    await persistAnalysis({ ...tenantBOwnerInOrgA, workspaceId: workspaceAOther }, otherWorkspaceRecord);
    await persistAnalysis({ userId: userB, organizationId: orgB, role: "owner", workspaceId: workspaceB }, otherOrganizationRecord);

    const noTenantAnalysis = await app.connect();
    try {
      await noTenantAnalysis.query("BEGIN");
      expect((await noTenantAnalysis.query("SELECT analysis_id FROM app.analysis")).rows).toEqual([]);
      expect((await noTenantAnalysis.query("SELECT analysis_id FROM app.analysis_approval")).rows).toEqual([]);
      await noTenantAnalysis.query("ROLLBACK");
    } finally { noTenantAnalysis.release(); }

    expect((await getPersistedAnalysis(tenantA, analysisA))?.analysisId).toBe(analysisA);
    expect(await getPersistedAnalysis({ ...tenantA, workspaceId: workspaceAOther }, analysisAOther)).toBeUndefined();
    expect(await getPersistedAnalysis({ ...tenantA, organizationId: orgB, workspaceId: workspaceB }, analysisB)).toBeUndefined();
    expect(await getPersistedAuditHistory({ ...tenantA, workspaceId: workspaceAOther }, analysisA)).toHaveLength(0);
    expect(await getPersistedAuditHistory({ ...tenantA, organizationId: orgB, workspaceId: workspaceB }, analysisB)).toHaveLength(0);

    const first = await recordPersistedApprovalDecision(tenantBOwnerInOrgA, { analysisId: analysisA, action: "approve" });
    expect(first.success).toBe(true);
    if (!first.success) throw new Error("Expected the first durable approval transition to succeed.");
    const second = await recordPersistedApprovalDecision(tenantBOwnerInOrgA, { analysisId: analysisA, action: "reject" });
    expect(second).toMatchObject({ success: false, reason: "conflict" });
    const audit = await getPersistedAuditHistory(tenantA, analysisA);
    expect(audit).toHaveLength(1);
    expect(audit[0].id).toBe(first.auditEntry.id);
    expect(audit[0].reviewedBy).toBe(userB);
    expect(audit[0].newStatus).toBe("approved");
    expect((await getPersistedAnalysis(tenantA, analysisA))?.approval.status).toBe("approved");
  }, 30000);
});
