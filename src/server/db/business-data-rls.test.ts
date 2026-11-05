import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as schema from "./schema";
import {
  deleteWorkspaceProduct,
  persistWorkspaceProduct,
  updateWorkspaceProduct
} from "./persistence";
import type { AuthenticatedTenant } from "../auth/session";

describe("Business Data RLS Permission Model & Authorization Suite", () => {
  const migrationPath = join(process.cwd(), "drizzle", "0004_workspace_business_data.sql");
  const migrationSql = readFileSync(migrationPath, "utf-8");

  describe("1. Drizzle Migration (0004_workspace_business_data.sql) Policy Audit", () => {
    it("defines a dedicated app.can_write_business_data function checking workspace read and allowed write roles", () => {
      // Must define app.can_write_business_data
      expect(migrationSql).toMatch(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+app\.can_write_business_data\s*\(\s*p_organization_id\s+text\s*,\s*p_workspace_id\s+text\s*\)/i
      );

      // Must delegate to app.can_read_workspace(p_organization_id, p_workspace_id)
      expect(migrationSql).toMatch(
        /app\.can_read_workspace\s*\(\s*p_organization_id\s*,\s*p_workspace_id\s*\)/i
      );

      // Must restrict write access to owner, admin, and analyst (excluding viewer)
      expect(migrationSql).toMatch(/m\.role\s+IN\s+\(\s*'owner'\s*,\s*'admin'\s*,\s*'analyst'\s*\)/i);

      // Must be STABLE SECURITY INVOKER
      expect(migrationSql).toMatch(/RETURNS\s+boolean\s+LANGUAGE\s+sql\s+STABLE\s+SECURITY\s+INVOKER/i);
    });

    it("never references analysis-specific can_write_analysis in business data migration", () => {
      expect(migrationSql).not.toContain("can_write_analysis");
    });

    it("never uses can_read_workspace for UPDATE or DELETE policies", () => {
      // Find all UPDATE and DELETE policy statements in the migration
      const updatePolicies = migrationSql.match(/CREATE\s+POLICY\s+\w+\s+ON\s+app\.\w+\s+FOR\s+UPDATE[\s\S]*?;/gi) || [];
      const deletePolicies = migrationSql.match(/CREATE\s+POLICY\s+\w+\s+ON\s+app\.\w+\s+FOR\s+DELETE[\s\S]*?;/gi) || [];

      expect(updatePolicies.length).toBe(3);
      expect(deletePolicies.length).toBe(3);

      for (const policy of [...updatePolicies, ...deletePolicies]) {
        expect(policy).not.toContain("can_read_workspace");
        expect(policy).toContain("can_write_business_data");
      }
    });

    it("defines separate SELECT, INSERT, UPDATE, and DELETE policies for all three business tables", () => {
      const tables = ["workspace_product", "workspace_sale", "workspace_sale_item"];

      for (const table of tables) {
        // SELECT policy
        expect(migrationSql).toMatch(
          new RegExp(`CREATE\\s+POLICY\\s+${table}_select\\s+ON\\s+app\\.${table}\\s+FOR\\s+SELECT\\s+USING\\s*\\(\\s*app\\.can_read_workspace\\(organization_id,\\s*workspace_id\\)\\s*\\);`, "i")
        );

        // INSERT policy
        expect(migrationSql).toMatch(
          new RegExp(`CREATE\\s+POLICY\\s+${table}_insert\\s+ON\\s+app\\.${table}\\s+FOR\\s+INSERT\\s+WITH\\s+CHECK\\s*\\(\\s*app\\.can_write_business_data\\(organization_id,\\s*workspace_id\\)\\s*\\);`, "i")
        );

        // UPDATE policy: must specify BOTH USING and WITH CHECK
        expect(migrationSql).toMatch(
          new RegExp(
            `CREATE\\s+POLICY\\s+${table}_update\\s+ON\\s+app\\.${table}\\s+FOR\\s+UPDATE\\s+USING\\s*\\(\\s*app\\.can_write_business_data\\(organization_id,\\s*workspace_id\\)\\s*\\)\\s+WITH\\s+CHECK\\s*\\(\\s*app\\.can_write_business_data\\(organization_id,\\s*workspace_id\\)\\s*\\);`,
            "i"
          )
        );

        // DELETE policy
        expect(migrationSql).toMatch(
          new RegExp(`CREATE\\s+POLICY\\s+${table}_delete\\s+ON\\s+app\\.${table}\\s+FOR\\s+DELETE\\s+USING\\s*\\(\\s*app\\.can_write_business_data\\(organization_id,\\s*workspace_id\\)\\s*\\);`, "i")
        );
      }
    });

    it("enables and forces RLS on all three business tables", () => {
      for (const table of ["workspace_product", "workspace_sale", "workspace_sale_item"]) {
        expect(migrationSql).toMatch(new RegExp(`ALTER\\s+TABLE\\s+app\\.${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY;`, "i"));
        expect(migrationSql).toMatch(new RegExp(`ALTER\\s+TABLE\\s+app\\.${table}\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY;`, "i"));
      }
    });

    it("preserves composite foreign key and unique scope constraints", () => {
      // workspace_product -> app.workspace(id, organization_id)
      expect(migrationSql).toMatch(
        /CONSTRAINT\s+workspace_product_workspace_fk\s+FOREIGN\s+KEY\s*\(\s*workspace_id\s*,\s*organization_id\s*\)\s*REFERENCES\s+app\.workspace\s*\(\s*id\s*,\s*organization_id\s*\)\s*ON\s+DELETE\s+CASCADE/i
      );
      expect(migrationSql).toMatch(
        /CONSTRAINT\s+workspace_product_scope_id_unique\s+UNIQUE\s*\(\s*id\s*,\s*organization_id\s*,\s*workspace_id\s*\)/i
      );

      // workspace_sale -> app.workspace(id, organization_id)
      expect(migrationSql).toMatch(
        /CONSTRAINT\s+workspace_sale_workspace_fk\s+FOREIGN\s+KEY\s*\(\s*workspace_id\s*,\s*organization_id\s*\)\s*REFERENCES\s+app\.workspace\s*\(\s*id\s*,\s*organization_id\s*\)\s*ON\s+DELETE\s+CASCADE/i
      );

      // workspace_sale_item -> workspace_sale and workspace_product
      expect(migrationSql).toMatch(
        /CONSTRAINT\s+workspace_sale_item_sale_fk\s+FOREIGN\s+KEY\s*\(\s*sale_id\s*,\s*organization_id\s*,\s*workspace_id\s*\)\s*REFERENCES\s+app\.workspace_sale\s*\(\s*id\s*,\s*organization_id\s*,\s*workspace_id\s*\)\s*ON\s+DELETE\s+CASCADE/i
      );
      expect(migrationSql).toMatch(
        /CONSTRAINT\s+workspace_sale_item_product_fk\s+FOREIGN\s+KEY\s*\(\s*product_id\s*,\s*organization_id\s*,\s*workspace_id\s*\)\s*REFERENCES\s+app\.workspace_product\s*\(\s*id\s*,\s*organization_id\s*,\s*workspace_id\s*\)\s*ON\s+DELETE\s+RESTRICT/i
      );
    });

    it("safely drops legacy combined policies to prevent OR-combination privilege leaks", () => {
      // Legacy combined policies must be explicitly dropped
      expect(migrationSql).toMatch(
        /DROP\s+POLICY\s+IF\s+EXISTS\s+workspace_product_tenant_isolation\s+ON\s+app\.workspace_product;/i
      );
      expect(migrationSql).toMatch(
        /DROP\s+POLICY\s+IF\s+EXISTS\s+workspace_sale_tenant_isolation\s+ON\s+app\.workspace_sale;/i
      );
      expect(migrationSql).toMatch(
        /DROP\s+POLICY\s+IF\s+EXISTS\s+workspace_sale_item_tenant_isolation\s+ON\s+app\.workspace_sale_item;/i
      );

      // Verify legacy drops occur BEFORE any CREATE POLICY statements
      const firstDropLegacy = migrationSql.indexOf("DROP POLICY IF EXISTS workspace_product_tenant_isolation");
      const firstCreatePolicy = migrationSql.indexOf("CREATE POLICY");
      expect(firstDropLegacy).toBeGreaterThan(-1);
      expect(firstCreatePolicy).toBeGreaterThan(-1);
      expect(firstDropLegacy).toBeLessThan(firstCreatePolicy);
    });

    it("makes policy creation idempotent by dropping operation-specific policies before recreating them", () => {
      const tables = ["workspace_product", "workspace_sale", "workspace_sale_item"];
      const operations = ["select", "insert", "update", "delete"];

      for (const table of tables) {
        for (const op of operations) {
          const policyName = `${table}_${op}`;
          const dropPattern = new RegExp(`DROP\\s+POLICY\\s+IF\\s+EXISTS\\s+${policyName}\\s+ON\\s+app\\.${table};`, "i");
          expect(migrationSql).toMatch(dropPattern);

          // Verify drop occurs before create
          const dropIdx = migrationSql.search(dropPattern);
          const createIdx = migrationSql.search(new RegExp(`CREATE\\s+POLICY\\s+${policyName}\\s+ON\\s+app\\.${table}`, "i"));
          expect(dropIdx).toBeGreaterThan(-1);
          expect(createIdx).toBeGreaterThan(-1);
          expect(dropIdx).toBeLessThan(createIdx);
        }
      }
    });

    it("grants table permissions and function execution to proofloop_app", () => {
      expect(migrationSql).toMatch(
        /GRANT\s+SELECT\s*,\s*INSERT\s*,\s*UPDATE\s*,\s*DELETE\s+ON\s+app\.workspace_product\s*,\s*app\.workspace_sale\s*,\s*app\.workspace_sale_item\s+TO\s+proofloop_app;/i
      );
      expect(migrationSql).toMatch(
        /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+app\.can_write_business_data\s*\(\s*text\s*,\s*text\s*\)\s+TO\s+proofloop_app;/i
      );
    });
  });

  describe("2. Drizzle Schema Consistency", () => {
    it("ensures Drizzle schema matches migration table names and columns", () => {
      // workspaceProduct
      expect(schema.workspaceProduct).toBeDefined();
      expect(schema.workspaceProduct.id).toBeDefined();
      expect(schema.workspaceProduct.organizationId).toBeDefined();
      expect(schema.workspaceProduct.workspaceId).toBeDefined();
      expect(schema.workspaceProduct.name).toBeDefined();
      expect(schema.workspaceProduct.category).toBeDefined();

      // workspaceSale
      expect(schema.workspaceSale).toBeDefined();
      expect(schema.workspaceSale.id).toBeDefined();
      expect(schema.workspaceSale.organizationId).toBeDefined();
      expect(schema.workspaceSale.workspaceId).toBeDefined();
      expect(schema.workspaceSale.orderDate).toBeDefined();
      expect(schema.workspaceSale.status).toBeDefined();

      // workspaceSaleItem
      expect(schema.workspaceSaleItem).toBeDefined();
      expect(schema.workspaceSaleItem.id).toBeDefined();
      expect(schema.workspaceSaleItem.organizationId).toBeDefined();
      expect(schema.workspaceSaleItem.workspaceId).toBeDefined();
      expect(schema.workspaceSaleItem.saleId).toBeDefined();
      expect(schema.workspaceSaleItem.productId).toBeDefined();
      expect(schema.workspaceSaleItem.quantity).toBeDefined();
      expect(schema.workspaceSaleItem.unitPrice).toBeDefined();
      expect(schema.workspaceSaleItem.unitCost).toBeDefined();
      expect(schema.workspaceSaleItem.discount).toBeDefined();
    });
  });

  describe("3. Application-Level Authorization Safeguards", () => {
    const viewerTenant: AuthenticatedTenant = {
      userId: "user-viewer-test",
      organizationId: "org-test",
      role: "viewer",
      workspaceId: "workspace-test"
    };

    it("rejects product insertion for read-only viewer role", async () => {
      await expect(
        persistWorkspaceProduct(viewerTenant, {
          name: "Unauthorized Product",
          category: "Security Test",
          price: 100,
          cost: 50,
          quantity: 1
        })
      ).rejects.toThrow(/does not grant permission to modify workspace data/i);
    });

    it("rejects product update for read-only viewer role", async () => {
      await expect(
        updateWorkspaceProduct(viewerTenant, "PROD-1", {
          name: "Hacked Product Name"
        })
      ).rejects.toThrow(/does not grant permission to modify workspace data/i);
    });

    it("rejects product deletion for read-only viewer role", async () => {
      await expect(
        deleteWorkspaceProduct(viewerTenant, "PROD-1")
      ).rejects.toThrow(/does not grant permission to modify workspace data/i);
    });

    it("requires a valid workspaceId for write operations", async () => {
      const noWorkspaceTenant: AuthenticatedTenant = {
        userId: "user-admin-test",
        organizationId: "org-test",
        role: "admin",
        workspaceId: undefined
      };

      await expect(
        persistWorkspaceProduct(noWorkspaceTenant, {
          name: "No Workspace Product",
          category: "General"
        })
      ).rejects.toThrow(/A verified workspace is required/i);

      await expect(
        updateWorkspaceProduct(noWorkspaceTenant, "PROD-1", { name: "Updated" })
      ).rejects.toThrow(/A verified workspace is required/i);

      await expect(
        deleteWorkspaceProduct(noWorkspaceTenant, "PROD-1")
      ).rejects.toThrow(/A verified workspace is required/i);
    });
  });
});
