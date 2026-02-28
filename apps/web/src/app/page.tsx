import { fetchProjects } from "@/lib/api";
import { ProjectCard } from "@/components/ProjectCard";
import type { ProjectDTO } from "@opfun/shared";

export const revalidate = 10;

export default async function HomePage() {
  let projects: ProjectDTO[] = [];
  let error = "";

  try {
    projects = await fetchProjects();
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not load projects";
  }

  return (
    <div>
      {/* Hero */}
      <section className="mb-12 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-4 py-1.5 text-xs text-zinc-400">
          <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
          OP_NET Testnet · Safe defaults enforced
        </div>
        <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl">
          Launch fast.{" "}
          <span className="text-brand-500">Stay secure.</span>
        </h1>
        <p className="mt-4 text-lg text-zinc-400 max-w-xl mx-auto">
          Every token on OPFun ships with an automated{" "}
          <span className="text-zinc-200 font-semibold">Risk Card</span> — transparent security
          scores, audit results, and live monitoring.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <a href="/create" className="btn-primary text-base px-8 py-3">
            Launch your token →
          </a>
          <a href="#feed" className="btn-secondary text-base px-8 py-3">
            Browse projects
          </a>
        </div>
      </section>

      {/* Feed */}
      <section id="feed">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">Recent Launches</h2>
          <span className="text-xs text-zinc-500">{projects.length} projects</span>
        </div>

        {error ? (
          <div className="card border-red-900 text-red-400 text-sm">
            ⚠ Could not connect to API: {error}. Make sure <code className="font-mono">pnpm dev</code> is running.
          </div>
        ) : projects.length === 0 ? (
          <div className="card text-center py-16">
            <p className="text-zinc-500 mb-4">No projects yet.</p>
            <a href="/create" className="btn-primary">
              Be the first to launch →
            </a>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
