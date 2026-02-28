import { fetchProject } from "@/lib/api";
import { notFound } from "next/navigation";
import { RunChecksPanel } from "@/components/RunChecksPanel";

export const revalidate = 5;

export default async function ProjectPage({ params }: { params: { slug: string } }) {
  let project;
  try {
    project = await fetchProject(params.slug);
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") notFound();
    throw e;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        {project.iconUrl && (
          <img
            src={project.iconUrl}
            alt={project.name}
            className="h-16 w-16 rounded-2xl border border-zinc-700 object-cover"
          />
        )}
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-black text-white">{project.name}</h1>
            <span className="font-mono text-sm text-zinc-500">{project.ticker}</span>
          </div>
          <p className="mt-1 text-sm text-zinc-400">{project.description}</p>
        </div>
      </div>

      {/* Meta grid */}
      <div className="grid gap-3 sm:grid-cols-3">
        <MetaCard label="Network" value={project.network} />
        <MetaCard label="Max Supply" value={Number(project.maxSupply).toLocaleString()} />
        <MetaCard label="Decimals" value={String(project.decimals)} />
        {project.contractAddress && (
          <MetaCard label="Contract" value={project.contractAddress} mono />
        )}
        {project.deployTx && <MetaCard label="Deploy TX" value={project.deployTx} mono />}
      </div>

      {/* Links */}
      {project.links && Object.keys(project.links as object).length > 0 && (
        <div className="card">
          <h2 className="mb-3 text-sm font-semibold text-zinc-300">Links</h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(project.links as Record<string, string>).map(([k, v]) => (
              <a
                key={k}
                href={v}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary text-xs py-1.5 px-3"
              >
                {k} ↗
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Run Checks Panel — client component (interactive) */}
      <RunChecksPanel initialProject={project as Parameters<typeof RunChecksPanel>[0]["initialProject"]} />

      {/* Watch Events */}
      <div className="card">
        <h2 className="mb-3 font-bold text-white">Watchtower Events</h2>
        {!project.watchEvents || project.watchEvents.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No events yet. Real-time monitoring comes in Milestone 4.
          </p>
        ) : (
          <div className="space-y-2">
            {(project.watchEvents as Array<{ id: string; severity: string; title: string; createdAt: string }>).map((ev) => (
              <div
                key={ev.id}
                className="flex items-center gap-3 rounded-lg bg-zinc-800 px-3 py-2 text-sm"
              >
                <SeverityDot severity={ev.severity} />
                <span className="text-zinc-200">{ev.title}</span>
                <span className="ml-auto text-xs text-zinc-500">
                  {new Date(ev.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MetaCard({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
      <p
        className={`mt-1 truncate text-sm text-zinc-200 ${mono ? "font-mono text-xs" : "font-semibold"}`}
      >
        {value}
      </p>
    </div>
  );
}

function SeverityDot({ severity }: { severity: string }) {
  const color =
    severity === "CRITICAL"
      ? "bg-red-500"
      : severity === "WARN"
      ? "bg-yellow-500"
      : "bg-blue-500";
  return <span className={`h-2 w-2 rounded-full ${color} shrink-0`} />;
}
