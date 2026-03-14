"use client";

import { useEffect, useState } from "react";
import { fetchProject } from "@/lib/api";
import { ProjectPageClient } from "@/components/ProjectPageClient";

type FullProject = Awaited<ReturnType<typeof fetchProject>>;

export function ProjectSlugClient({ slug }: { slug: string }) {
  const [project, setProject] = useState<FullProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError("");
    fetchProject(slug)
      .then((data) => {
        if (!cancelled) setProject(data);
      })
      .catch((e) => {
        if (cancelled) return;
        setProject(null);
        setError(e instanceof Error && e.message === "NOT_FOUND" ? "Project not found." : e instanceof Error ? e.message : "Failed to load project.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="op-panel p-6 text-sm text-[var(--text-muted)]">Loading project...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="op-panel p-6">
          <h1 className="text-2xl font-black text-ink">Project</h1>
          <p className="mt-2 text-sm font-semibold text-opRed">{error || "Failed to load project."}</p>
        </div>
      </div>
    );
  }

  return <ProjectPageClient initialProject={project} />;
}
