import { describe, expect, it } from "vitest";
import { tenantRequestInit } from "./tenant-api";

describe("workspace-scoped API request options", () => {
  it("adds the selected workspace while preserving method and existing headers", () => {
    const request = tenantRequestInit({ method: "POST", headers: { "Content-Type": "application/json", "X-Request-Id": "req-1" } }, "workspace-42");
    const headers = new Headers(request.headers);
    expect(request.method).toBe("POST");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-request-id")).toBe("req-1");
    expect(headers.get("x-proofloop-workspace-id")).toBe("workspace-42");
  });

  it("does not invent a workspace header when no workspace is selected", () => {
    const request = tenantRequestInit({ headers: { "Content-Type": "application/json" } });
    expect(new Headers(request.headers).has("x-proofloop-workspace-id")).toBe(false);
  });
});
