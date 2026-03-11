import { fetchProjects } from "@/lib/api";
import type { ProjectDTO } from "@opfun/shared";
import { TrendingClient } from "./TrendingClient";

export const revalidate = 10;
export const metadata = { title: "Trending — OpStreet" };

export default async function TrendingPage() {
  const result = await fetchProjects("trending").catch(() => ({ items: [] as ProjectDTO[], nextCursor: null, hasMore: false }));
  return <TrendingClient initialProjects={result.items} />;
}
