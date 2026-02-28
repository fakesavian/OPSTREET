import { fetchProject } from "@/lib/api";
import { notFound } from "next/navigation";
import { ProjectPageClient } from "@/components/ProjectPageClient";

export const revalidate = 5;

export default async function ProjectPage({ params }: { params: { slug: string } }) {
  let project;
  try {
    project = await fetchProject(params.slug);
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") notFound();
    throw e;
  }

  return <ProjectPageClient initialProject={project} />;
}
