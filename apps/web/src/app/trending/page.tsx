import type { ProjectDTO } from "@opfun/shared";
import { MarketHubClient } from "@/components/opfun/MarketHubClient";

export const dynamic = "force-dynamic";
export const revalidate = 10;
export const metadata = { title: "Trending - OpStreet" };

export default async function TrendingPage() {
  return <MarketHubClient initialProjects={[] as ProjectDTO[]} initialSection="trending" />;
}
