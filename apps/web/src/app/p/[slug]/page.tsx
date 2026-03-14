import { redirect } from "next/navigation";
import { ProjectSlugClient } from "./ProjectSlugClient";

export const dynamic = "force-dynamic";
export const revalidate = 5;

export default function ProjectPage({ params }: { params: { slug: string } }) {
  const slug = params.slug.toLowerCase();
  if (slug === "trending") redirect("/trending");
  if (slug === "leaderboards" || slug === "leaders") redirect("/leaderboards");
  if (slug === "players") redirect("/players");
  if (slug === "floor") redirect("/floor");
  if (slug === "shop") redirect("/shop");
  if (slug === "docs") redirect("/docs");
  if (slug === "clans") redirect("/clans");
  if (slug === "create") redirect("/create");

  return <ProjectSlugClient slug={params.slug} />;
}
