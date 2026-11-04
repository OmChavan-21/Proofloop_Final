import { loadDemoSnapshot } from "@/components/dashboard/load-demo-snapshot";
import { BusinessOverview } from "@/components/dashboard/business-overview";

export default async function Home() {
  const snapshot = await loadDemoSnapshot();
  return <BusinessOverview snapshot={snapshot} />;
}
