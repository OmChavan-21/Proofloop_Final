import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as getDashboardRoute } from "../app/api/dashboard/route";
import { GET as getProductsRoute, POST as postProductRoute } from "../app/api/products/route";
import { GET as getProductDetailRoute } from "../app/api/products/[id]/route";
import { GET as getAnalysesRoute, POST as postAnalysisRoute } from "../app/api/analysis/route";
import { GET as getPendingApprovalsRoute } from "../app/api/approvals/pending/route";
import { GET as getAuditRoute, POST as postApprovalRoute } from "../app/api/approvals/route";
import { clearStore } from "./storage";
import { clearAllWorkspaceDatabases } from "../engine/workspace-manager";

describe("Workspace Data Isolation & Multi-Tenancy Suite", () => {
  beforeEach(() => {
    clearStore();
    clearAllWorkspaceDatabases();
  });

  afterEach(() => {
    clearStore();
    clearAllWorkspaceDatabases();
  });

  it("1. ensures a newly created workspace starts completely empty with no copied data", async () => {
    const demoResponse = await getDashboardRoute(new NextRequest("http://localhost:3000/api/dashboard"));
    const demoSnapshot = await demoResponse.json();
    expect(demoSnapshot.products.length).toBeGreaterThan(0);

    const wsId = "workspace-new-clean";
    const request = new NextRequest("http://localhost:3000/api/dashboard", {
      headers: {
        "x-proofloop-workspace-id": wsId,
      },
    });

    const response = await getDashboardRoute(request);
    expect(response.status).toBe(200);

    const snapshot = await response.json();
    expect(snapshot.dataSource).toBe("workspace_data");
    expect(snapshot.products).toEqual([]);
    expect(snapshot.q3.revenue).toBe(0);
    expect(snapshot.q3.cost).toBe(0);
    expect(snapshot.q3.grossProfit).toBe(0);
    expect(snapshot.q3.units).toBe(0);
    expect(snapshot.q3.saleCount).toBe(0);

    expect(snapshot.q4.revenue).toBe(0);
    expect(snapshot.q4.cost).toBe(0);
    expect(snapshot.q4.grossProfit).toBe(0);
    expect(snapshot.q4.units).toBe(0);
    expect(snapshot.q4.saleCount).toBe(0);

    expect(snapshot.marginChange).toBe(0);
    expect(snapshot.declinedCount).toBe(0);
  });

  it("keeps equal workspace IDs isolated across organizations in local workspace storage", async () => {
    const workspaceId = "same-workspace-id";
    for (const [organizationId, productId, productName] of [
      ["organization-a", "ORG-A-PRODUCT", "Organization A item"],
      ["organization-b", "ORG-B-PRODUCT", "Organization B item"]
    ]) {
      const response = await postProductRoute(new NextRequest("http://localhost:3000/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-proofloop-workspace-id": workspaceId, "x-proofloop-organization-id": organizationId },
        body: JSON.stringify({ id: productId, name: productName, category: "Isolation", quantity: 2, price: 10, cost: 4 })
      }));
      expect(response.status).toBe(201);
    }

    const read = async (organizationId: string) => getProductsRoute(new NextRequest("http://localhost:3000/api/products", {
      headers: { "x-proofloop-workspace-id": workspaceId, "x-proofloop-organization-id": organizationId }
    }));
    const orgA = await (await read("organization-a")).json();
    const orgB = await (await read("organization-b")).json();
    expect(orgA.products.map((item: { productId: string }) => item.productId)).toEqual(["ORG-A-PRODUCT"]);
    expect(orgB.products.map((item: { productId: string }) => item.productId)).toEqual(["ORG-B-PRODUCT"]);
  });

  it("2. ensures Workspace A and Workspace B have independent KPIs", async () => {
    const wsA = "workspace-kpi-a";
    const wsB = "workspace-kpi-b";

    // Add Product 1 to Workspace A: price 200, cost 100, quantity 10 -> Revenue: 2000, Profit: 1000
    const addA = new NextRequest("http://localhost:3000/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-proofloop-workspace-id": wsA },
      body: JSON.stringify({
        name: "Enterprise Cloud Node",
        category: "Cloud",
        price: 200,
        cost: 100,
        quantity: 10,
      }),
    });
    const resA = await postProductRoute(addA);
    expect(resA.status).toBe(201);

    // Add Product 2 to Workspace B: price 500, cost 100, quantity 2 -> Revenue: 1000, Profit: 800
    const addB = new NextRequest("http://localhost:3000/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-proofloop-workspace-id": wsB },
      body: JSON.stringify({
        name: "Edge Gateway Router",
        category: "Hardware",
        price: 500,
        cost: 100,
        quantity: 2,
      }),
    });
    const resB = await postProductRoute(addB);
    expect(resB.status).toBe(201);

    // Query Workspace A dashboard
    const reqDashA = new NextRequest("http://localhost:3000/api/dashboard", {
      headers: { "x-proofloop-workspace-id": wsA },
    });
    const snapA = await (await getDashboardRoute(reqDashA)).json();
    expect(snapA.q4.revenue).toBe(2000);
    expect(snapA.q4.cost).toBe(1000);
    expect(snapA.q4.grossProfit).toBe(1000);
    expect(snapA.q4.units).toBe(10);
    expect(snapA.q4.grossMargin).toBe(50);

    // Query Workspace B dashboard
    const reqDashB = new NextRequest("http://localhost:3000/api/dashboard", {
      headers: { "x-proofloop-workspace-id": wsB },
    });
    const snapB = await (await getDashboardRoute(reqDashB)).json();
    expect(snapB.q4.revenue).toBe(1000);
    expect(snapB.q4.cost).toBe(200);
    expect(snapB.q4.grossProfit).toBe(800);
    expect(snapB.q4.units).toBe(2);
    expect(snapB.q4.grossMargin).toBe(80);
  });

  it("3. verifies products added to Workspace A do not appear in Workspace B", async () => {
    const wsA = "workspace-prod-a";
    const wsB = "workspace-prod-b";

    const addReq = new NextRequest("http://localhost:3000/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-proofloop-workspace-id": wsA },
      body: JSON.stringify({
        id: "PROD-ALPHA",
        name: "Workspace A Exclusive Tool",
        category: "Software",
        price: 99,
        cost: 20,
        quantity: 5,
      }),
    });
    const addRes = await postProductRoute(addReq);
    expect(addRes.status).toBe(201);

    // Workspace A must list PROD-ALPHA
    const listA = await (await getProductsRoute(new NextRequest("http://localhost:3000/api/products", {
      headers: { "x-proofloop-workspace-id": wsA },
    }))).json();
    expect(listA.count).toBe(1);
    expect(listA.products[0].productId).toBe("PROD-ALPHA");

    // Workspace B must be completely empty
    const listB = await (await getProductsRoute(new NextRequest("http://localhost:3000/api/products", {
      headers: { "x-proofloop-workspace-id": wsB },
    }))).json();
    expect(listB.count).toBe(0);
    expect(listB.products).toEqual([]);

    // Direct detail query in Workspace B must return 404
    const detailB = await getProductDetailRoute(
      new NextRequest("http://localhost:3000/api/products/PROD-ALPHA", {
        headers: { "x-proofloop-workspace-id": wsB },
      }),
      { params: Promise.resolve({ id: "PROD-ALPHA" }) }
    );
    expect(detailB.status).toBe(404);
  });

  it("4. proves AI insights, approvals, and audit history are workspace-isolated", async () => {
    const wsA = "workspace-ai-a";
    const wsB = "workspace-ai-b";

    // Seed product with declining margin into Workspace A (Q3 margin 80%, Q4 margin 30%)
    await postProductRoute(new NextRequest("http://localhost:3000/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-proofloop-workspace-id": wsA },
      body: JSON.stringify({
        id: "PROD-DECLINE",
        name: "Degrading Margin Product",
        category: "Electronics",
        price: 100,
        cost: 20,
        quantity: 10,
        orderDate: "2026-08-15",
      }),
    }));

    await postProductRoute(new NextRequest("http://localhost:3000/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-proofloop-workspace-id": wsA },
      body: JSON.stringify({
        id: "PROD-DECLINE",
        name: "Degrading Margin Product",
        category: "Electronics",
        price: 100,
        cost: 70,
        quantity: 10,
        orderDate: "2026-10-15",
      }),
    }));

    // Run analysis in Workspace A
    const analysisReq = new NextRequest("http://localhost:3000/api/analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-proofloop-workspace-id": wsA },
      body: JSON.stringify({ question: "Why is margin changing in Q4?" }),
    });
    const analysisRes = await postAnalysisRoute(analysisReq);
    expect(analysisRes.status).toBe(200);
    const analysisA = await analysisRes.json();
    expect(analysisA.analysisId).toBeDefined();
    expect(analysisA.approval.status).toBe("pending");
    expect(analysisA.metadata.dataSource).toBe("workspace_data");
    expect(analysisA.metadata.isDemoData).toBe(false);
    expect(analysisA.explanation.summary).not.toContain("Seeded Demo Data");

    const emptyWorkspaceAnalysisRes = await postAnalysisRoute(new NextRequest("http://localhost:3000/api/analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-proofloop-workspace-id": wsB },
      body: JSON.stringify({ question: "Why is margin changing in Q4?" })
    }));
    const emptyWorkspaceAnalysis = await emptyWorkspaceAnalysisRes.json();
    expect(emptyWorkspaceAnalysis.evidence).toEqual([]);
    expect(emptyWorkspaceAnalysis.results).toEqual([]);

    // Record approval in Workspace A
    const approvalReq = new NextRequest("http://localhost:3000/api/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-proofloop-workspace-id": wsA },
      body: JSON.stringify({
        analysisId: analysisA.analysisId,
        action: "approve",
        notes: "Approved in Workspace A",
      }),
    });
    const approvalRes = await postApprovalRoute(approvalReq);
    expect(approvalRes.status).toBe(200);

    // Workspace A must see the analysis, pending queue, and audit log
    const analysesA = await (await getAnalysesRoute(new NextRequest("http://localhost:3000/api/analysis", {
      headers: { "x-proofloop-workspace-id": wsA },
    }))).json();
    expect(analysesA.count).toBe(1);

    const auditA = await (await getAuditRoute(new NextRequest("http://localhost:3000/api/approvals", {
      headers: { "x-proofloop-workspace-id": wsA },
    }))).json();
    expect(auditA.count).toBe(1);

    // Workspace B must have zero analyses, zero pending approvals, and zero audit entries
    const analysesB = await (await getAnalysesRoute(new NextRequest("http://localhost:3000/api/analysis", {
      headers: { "x-proofloop-workspace-id": wsB },
    }))).json();
    expect(analysesB.count).toBe(1);
    expect(analysesB.analyses).toHaveLength(1);
    expect(analysesB.analyses[0].analysisId).toBe(emptyWorkspaceAnalysis.analysisId);
    expect(analysesB.analyses[0].evidence).toEqual([]);

    const pendingB = await (await getPendingApprovalsRoute(new NextRequest("http://localhost:3000/api/approvals/pending", {
      headers: { "x-proofloop-workspace-id": wsB },
    }))).json();
    expect(pendingB.count).toBe(0);
    expect(pendingB.pendingApprovals).toEqual([]);

    const auditB = await (await getAuditRoute(new NextRequest("http://localhost:3000/api/approvals", {
      headers: { "x-proofloop-workspace-id": wsB },
    }))).json();
    expect(auditB.count).toBe(0);
    expect(auditB.auditHistory).toEqual([]);
  });

  it("5. verifies switching back and forth between workspaces restores their exact data", async () => {
    const ws1 = "workspace-switch-1";
    const ws2 = "workspace-switch-2";

    // Populate Workspace 1
    await postProductRoute(new NextRequest("http://localhost:3000/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-proofloop-workspace-id": ws1 },
      body: JSON.stringify({ name: "Widget 1", category: "Gadgets", price: 100, cost: 50, quantity: 5 }),
    }));

    // Step 1: Read Workspace 1
    const res1First = await (await getDashboardRoute(new NextRequest("http://localhost:3000/api/dashboard", {
      headers: { "x-proofloop-workspace-id": ws1 },
    }))).json();
    expect(res1First.q4.revenue).toBe(500);
    expect(res1First.products.length).toBe(1);

    // Step 2: Switch to Workspace 2 (starts empty)
    const res2 = await (await getDashboardRoute(new NextRequest("http://localhost:3000/api/dashboard", {
      headers: { "x-proofloop-workspace-id": ws2 },
    }))).json();
    expect(res2.q4.revenue).toBe(0);
    expect(res2.products.length).toBe(0);

    // Step 3: Switch back to Workspace 1 (restores original data without mutation)
    const res1Second = await (await getDashboardRoute(new NextRequest("http://localhost:3000/api/dashboard", {
      headers: { "x-proofloop-workspace-id": ws1 },
    }))).json();
    expect(res1Second.q4.revenue).toBe(500);
    expect(res1Second.products.length).toBe(1);
    expect(res1Second.products[0].productName).toBe("Widget 1");
  });

  it("6. simulates page refresh with persisted workspace identifier", async () => {
    const activeWs = "workspace-persisted-refreshed";

    // Add item before refresh
    await postProductRoute(new NextRequest("http://localhost:3000/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-proofloop-workspace-id": activeWs },
      body: JSON.stringify({ name: "Persistent Monitor", category: "Displays", price: 300, cost: 150, quantity: 2 }),
    }));

    // Simulating initial load
    const preRefresh = await (await getDashboardRoute(new NextRequest("http://localhost:3000/api/dashboard", {
      headers: { "x-proofloop-workspace-id": activeWs },
    }))).json();
    expect(preRefresh.q4.revenue).toBe(600);

    // Simulating browser reload with stored workspace header
    const postRefresh = await (await getDashboardRoute(new NextRequest("http://localhost:3000/api/dashboard", {
      headers: { "x-proofloop-workspace-id": activeWs },
    }))).json();
    expect(postRefresh.q4.revenue).toBe(600);
    expect(postRefresh.products[0].productName).toBe("Persistent Monitor");
  });

  it("7. blocks unauthorized roles from modifying analyses or approvals", async () => {
    const wsAuth = "workspace-auth-check";

    // Viewer role trying to run analysis should be rejected
    const viewerRun = new NextRequest("http://localhost:3000/api/analysis", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-proofloop-workspace-id": wsAuth,
        "x-proofloop-role": "viewer",
      },
      body: JSON.stringify({ question: "Unauthorized question" }),
    });

    const runRes = await postAnalysisRoute(viewerRun);
    expect(runRes.status).toBe(403);
    const runBody = await runRes.json();
    expect(runBody.error).toMatch(/does not grant the requested capability/i);

    // Viewer role attempting approval decision
    const viewerApproval = new NextRequest("http://localhost:3000/api/approvals", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-proofloop-workspace-id": wsAuth,
        "x-proofloop-role": "viewer",
      },
      body: JSON.stringify({
        analysisId: "any-id",
        action: "approve",
      }),
    });
    const appRes = await postApprovalRoute(viewerApproval);
    expect(appRes.status).toBe(403);
    const appBody = await appRes.json();
    expect(appBody.error).toMatch(/does not grant the requested capability/i);
  });

  it("8. resolves active workspace from proofloop_workspace_id cookie when header is absent", async () => {
    const wsFromCookie = "workspace-from-cookie";
    const reqWithCookie = new NextRequest("http://localhost:3000/api/dashboard", {
      headers: {
        cookie: `proofloop_workspace_id=${wsFromCookie}; other=value`,
      },
    });

    const res = await getDashboardRoute(reqWithCookie);
    expect(res.status).toBe(200);
    const snapshot = await res.json();
    expect(snapshot.dataSource).toBe("workspace_data");
    expect(snapshot.products).toEqual([]);
    expect(snapshot.q4.revenue).toBe(0);
  });
});
