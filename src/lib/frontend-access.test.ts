import { describe, expect, it } from "vitest";
import { canDecideApprovals, canRunAnalysis } from "./frontend-access";

describe("frontend role affordances", () => {
  it("allows decisions only for organization owners and admins", () => {
    expect(canDecideApprovals("owner")).toBe(true);
    expect(canDecideApprovals("admin")).toBe(true);
    expect(canDecideApprovals("analyst")).toBe(false);
    expect(canDecideApprovals("viewer")).toBe(false);
    expect(canDecideApprovals("unknown")).toBe(false);
  });

  it("allows analysis for owner, admin and analyst roles", () => {
    expect(canRunAnalysis("owner")).toBe(true);
    expect(canRunAnalysis("admin")).toBe(true);
    expect(canRunAnalysis("analyst")).toBe(true);
    expect(canRunAnalysis("viewer")).toBe(false);
    expect(canRunAnalysis("")).toBe(false);
  });
});
