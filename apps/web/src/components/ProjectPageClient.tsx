"use client";

import { useState } from "react";
import type { ProjectDTO } from "@opfun/shared";
import type { CheckRun } from "@/lib/api";
import { RunChecksPanel } from "./RunChecksPanel";
import { DeployPanel } from "./DeployPanel";

type FullProject = ProjectDTO & { checkRuns: CheckRun[]; watchEvents: unknown[] };

export function ProjectPageClient({ initialProject }: { initialProject: FullProject }) {
  const [project, setProject] = useState<FullProject>(initialProject);

  function handleStatusChange(newStatus: string, updates?: Partial<ProjectDTO>) {
    setProject((p) => ({ ...p, status: newStatus as ProjectDTO["status"], ...updates }));
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
        {project.buildHash && <MetaCard label="Build Hash" value={project.buildHash} mono />}
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

      {/* Security checks + Risk Card */}
      <RunChecksPanel
        initialProject={project}
        onStatusChange={handleStatusChange}
      />

      {/* Deploy panel — shows when READY or LAUNCHED */}
      {(project.status === "READY" || project.status === "LAUNCHED" || project.status === "CHECKING") && (
        <DeployPanel project={project} onStatusChange={handleStatusChange} />
      )}

      {/* Watchtower */}
      <div className="card">
        <h2 className="mb-3 font-bold text-white">Watchtower Events</h2>
        {!project.watchEvents || project.watchEvents.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No events yet. Real-time monitoring active in Milestone 4.
          </p>
        ) : (
          <div className="space-y-2">
            {(
              project.watchEvents as Array<{
                id: string;
                severity: string;
                title: string;
                createdAt: string;
              }>
            ).map((ev) => (
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
