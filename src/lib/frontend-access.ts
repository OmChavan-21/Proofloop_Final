export function canDecideApprovals(role: string): boolean {
  return role === "owner" || role === "admin";
}

export function canRunAnalysis(role: string): boolean {
  return role === "owner" || role === "admin" || role === "analyst";
}
