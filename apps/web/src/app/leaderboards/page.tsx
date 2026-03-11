import { fetchLeaderboard } from "@/lib/api";
import { LeaderboardsClient } from "./LeaderboardsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leaderboards - OpStreet" };

export default async function LeaderboardsPage() {
  const initial = await fetchLeaderboard("earners", "7d").catch(() => ({ range: "7d", items: [] }));
  return <LeaderboardsClient initial={initial} />;
}
