import type { ProjectDTO } from "@opfun/shared";
import { MarketHubClient } from "@/components/opfun/MarketHubClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leaderboards - OpStreet" };

export default async function LeaderboardsPage() {
  return <MarketHubClient initialProjects={[] as ProjectDTO[]} initialSection="leaders" />;
}
