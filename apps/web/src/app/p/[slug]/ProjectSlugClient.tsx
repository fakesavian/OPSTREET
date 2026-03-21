"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchProject } from "@/lib/api";
import { ProjectPageClient } from "@/components/ProjectPageClient";

type FullProject = Awaited<ReturnType<typeof fetchProject>>;

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1500;

export function ProjectSlugClient({ slug }: { slug: string }) {
  const [project, setProject] = useState<FullProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const cancelledRef = useRef(false);

  const load = useCallback(
    async (retryNum: number) => {
      setLoading(true);
      setError("");

      let lastError = "";
      for (let i = 0; i <= retryNum; i++) {
        if (cancelledRef.current) return;
        if (i > 0) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        try {
          const data = await fetchProject(slug);
          if (!cancelledRef.current) {
            setProject(data);
            setLoading(false);
          }
          return;
        } catch (e) {
          lastError =
            e instanceof Error && e.message === "NOT_FOUND"
              ? "NOT_FOUND"
              : e instanceof Error
              ? e.message
              : "Failed to load project.";
          if (lastError === "NOT_FOUND") break; // no point retrying a 404
        }
      }

      if (!cancelledRef.current) {
        setProject(null);
        setError(lastError);
        setLoading(false);
      }
    },
    [slug],
  );

  useEffect(() => {
    cancelledRef.current = false;
    void load(MAX_RETRIES);
    return () => {
      cancelledRef.current = true;
    };
  }, [load, attempt]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="op-panel p-6 flex items-center gap-3 text-sm text-[var(--text-muted)]">
          <span className="h-3 w-3 rounded-full bg-opYellow border-2 border-ink animate-pulse shrink-0" />
          Loading project{attempt > 0 ? ` (retry ${attempt}/${MAX_RETRIES})` : ""}...
        </div>
      </div>
    );
  }

  if (!project) {
    const isNotFound = error === "NOT_FOUND";
    return (
      <div className="mx-auto max-w-4xl">
        <div className="op-panel p-6 space-y-4">
          <h1 className="text-2xl font-black text-ink">
            {isNotFound ? "Project not found" : "Could not load project"}
          </h1>
          {isNotFound ? (
            <p className="text-sm font-semibold text-[var(--text-muted)]">
              No project at <span className="font-mono text-ink">/p/{slug}</span>.
              It may still be processing — try refreshing in a few seconds.
            </p>
          ) : (
            <>
              <p className="text-sm font-semibold text-opRed">{error}</p>
              <p className="text-xs text-[var(--text-muted)]">
                The API was temporarily unreachable. Your token was likely created successfully.
                Click retry or refresh the page.
              </p>
            </>
          )}
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={() => { cancelledRef.current = false; setAttempt((a) => a + 1); }}
              className="op-btn-primary px-4 py-2 text-sm"
            >
              Retry
            </button>
            <a href="/" className="op-btn-outline px-4 py-2 text-sm">
              Browse all tokens
            </a>
          </div>
        </div>
      </div>
    );
  }

  return <ProjectPageClient initialProject={project} />;
}
