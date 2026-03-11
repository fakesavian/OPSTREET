import { fetchProject } from "@/lib/api";
import { notFound, redirect } from "next/navigation";
import { ProjectPageClient } from "@/components/ProjectPageClient";

export const revalidate = 5;

export default async function ProjectPage({ params }: { params: { slug: string } }) {
  const slug = params.slug.toLowerCase();
  if (slug === "trending") redirect("/trending");
  if (slug === "leaderboards" || slug === "leaders") redirect("/leaderboards");
  if (slug === "players") redirect("/players");
  if (slug === "floor") redirect("/floor");
  if (slug === "shop") redirect("/shop");
  if (slug === "docs") redirect("/docs");
  if (slug === "clans") redirect("/clans");
  if (slug === "create") redirect("/create");

  let project;
  try {
    project = await fetchProject(params.slug);
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") notFound();
    throw e;
  }

  return <ProjectPageClient initialProject={project} />;
}
