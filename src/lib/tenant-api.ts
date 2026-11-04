export function tenantRequestInit(init: RequestInit = {}, workspaceId = ""): RequestInit {
  const headers = new Headers(init.headers);
  if (workspaceId) headers.set("x-proofloop-workspace-id", workspaceId);
  return { ...init, headers };
}
