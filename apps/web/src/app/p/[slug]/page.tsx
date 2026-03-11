import { fetchProject } from "@/lib/api";
import { notFound } from "next/navigation";
import { ProjectPageClient } from "@/components/ProjectPageClient";
import TrendingPage from "../../trending/page";
import LeaderboardsPage from "../../leaderboards/page";
import PlayersPage from "../../players/page";
import FloorPage from "../../floor/page";
import ShopPage from "../../shop/page";
import DocsPage from "../../docs/page";
import ClansPage from "../../clans/page";
import CreatePage from "../../create/page";

export const revalidate = 5;

export default async function ProjectPage({ params }: { params: { slug: string } }) {
  const slug = params.slug.toLowerCase();
  if (slug === "trending") return <TrendingPage />;
  if (slug === "leaderboards" || slug === "leaders") return <LeaderboardsPage />;
  if (slug === "players") return <PlayersPage />;
  if (slug === "floor") return <FloorPage />;
  if (slug === "shop") return <ShopPage />;
  if (slug === "docs") return <DocsPage />;
  if (slug === "clans") return <ClansPage />;
  if (slug === "create") return <CreatePage />;

  let project;
  try {
    project = await fetchProject(params.slug);
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") notFound();
    throw e;
  }

  return <ProjectPageClient initialProject={project} />;
}
