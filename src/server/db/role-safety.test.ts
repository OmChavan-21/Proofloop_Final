import { describe, expect, it } from "vitest";
import { isSafeRuntimeRole } from "./index";

describe("PostgreSQL runtime role safety", () => {
  const leastPrivilegeRole = {
    rolsuper: false,
    rolbypassrls: false,
    app_schema_create: false,
    owns_application_objects: false
  };

  it("accepts a non-owner role that cannot bypass RLS or create schema objects", () => {
    expect(isSafeRuntimeRole(leastPrivilegeRole)).toBe(true);
  });

  it.each([
    { rolsuper: true },
    { rolbypassrls: true },
    { app_schema_create: true },
    { owns_application_objects: true }
  ])("rejects a privileged role state", (override) => {
    expect(isSafeRuntimeRole({ ...leastPrivilegeRole, ...override })).toBe(false);
  });

  it("rejects a missing role result", () => {
    expect(isSafeRuntimeRole(undefined)).toBe(false);
  });
});
