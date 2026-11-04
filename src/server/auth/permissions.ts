export type OrganizationRole = "owner" | "admin" | "analyst" | "viewer";
export type Capability = "organization:manage" | "workspace:manage" | "workspace:list" | "analysis:run" | "analysis:read" | "approval:decide";

const roleCapabilities: Record<OrganizationRole, ReadonlySet<Capability>> = {
  owner: new Set(["organization:manage", "workspace:manage", "workspace:list", "analysis:run", "analysis:read", "approval:decide"]),
  admin: new Set(["workspace:manage", "workspace:list", "analysis:run", "analysis:read", "approval:decide"]),
  analyst: new Set(["workspace:list", "analysis:run", "analysis:read"]),
  viewer: new Set(["workspace:list", "analysis:read"])
};

export function hasCapability(role: string, capability: Capability): role is OrganizationRole {
  return role in roleCapabilities && roleCapabilities[role as OrganizationRole].has(capability);
}
