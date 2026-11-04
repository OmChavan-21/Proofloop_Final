import { describe, expect, it } from "vitest";
import { hasCapability } from "./permissions";

describe("organization permission matrix", () => {
  it("enforces Owner, Admin, Analyst and Viewer capabilities on the server", () => {
    expect(hasCapability("owner", "organization:manage")).toBe(true);
    expect(hasCapability("admin", "organization:manage")).toBe(false);
    expect(hasCapability("admin", "workspace:manage")).toBe(true);
    expect(hasCapability("analyst", "analysis:run")).toBe(true);
    expect(hasCapability("analyst", "approval:decide")).toBe(false);
    expect(hasCapability("viewer", "analysis:read")).toBe(true);
    expect(hasCapability("viewer", "analysis:run")).toBe(false);
    expect(hasCapability("forged-owner", "workspace:manage")).toBe(false);
  });
});
