import { fetchProject } from "@/lib/api";
import { notFound } from "next/navigation";
import type { RiskCard } from "@opfun/shared";

export const revalidate = 5;

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-zinc-800 text-zinc-400 border-zinc-700",
  CHECKING: "bg-yellow-900/40 text-yellow-300 border-yellow-800",
  READY: "bg-blue-900/40 text-blue-300 border-blue-800",
  LAUNCHED: "bg-green-900/40 text-green-300 border-green-800",
  FLAGGED: "bg-red-900/40 text-red-300 border-red-800",
  GRADUATED: "bg-purple-900/40 text-purple-300 border-purple-800",
};

export default async function ProjectPage({ params }: { params: { slug: string } }) {
  let project;
  try {
    project = await fetchProject(params.slug);
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") notFound();
    throw e;
  }

  const statusStyle = STATUS_STYLES[project.status] ?? STATUS_STYLES["DRAFT"]!;
  const riskCard = project.riskCard as RiskCard | null;

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
            <span className={`badge border ${statusStyle}`}>{project.status}</span>
          </div>
          <p className="mt-1 text-sm text-zinc-400">{project.description}</p>
        </div>
      </div>

      {/* Meta grid */}
      <div className="grid gap-4 sm:grid-cols-3">
        <MetaCard label="Network" value={project.network} />
        <MetaCard label="Max Supply" value={Number(project.maxSupply).toLocaleString()} />
        <MetaCard label="Decimals" value={String(project.decimals)} />
        {project.contractAddress && (
          <MetaCard label="Contract" value={project.contractAddress} mono />
        )}
        {project.deployTx && (
          <MetaCard label="Deploy TX" value={project.deployTx} mono />
        )}
        {project.buildHash && (
          <MetaCard label="Build Hash" value={project.buildHash} mono />
        )}
      </div>

      {/* Links */}
      {project.links && Object.keys(project.links).length > 0 && (
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

      {/* Risk Card */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-white">Risk Card</h2>
          {project.riskScore !== null ? (
            <RiskScoreBadge score={project.riskScore} />
          ) : (
            <span className="text-xs text-zinc-500">Not yet scored</span>
          )}
        </div>

        {riskCard ? (
          <RiskCardView card={riskCard} />
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-700 py-10 text-center">
            <p className="text-sm text-zinc-500 mb-3">
              Risk Card will appear after running security checks (Milestone 2).
            </p>
            <span className="text-xs text-zinc-600">
              POST /projects/{project.id}/run-checks
            </span>
          </div>
        )}
      </div>

      {/* Watch Events */}
      <div className="card">
        <h2 className="mb-3 font-bold text-white">Watchtower Events</h2>
        {(project as { watchEvents?: unknown[] }).watchEvents?.length === 0 ? (
          <p className="text-sm text-zinc-500">No events yet. Watchtower active in Milestone 4.</p>
        ) : (
          <div className="space-y-2">
            {((project as { watchEvents?: Array<{id: string; severity: string; title: string; createdAt: string}> }).watchEvents ?? []).map((ev) => (
              <div key={ev.id} className="flex items-center gap-3 rounded-lg bg-zinc-800 px-3 py-2 text-sm">
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
      <p className={`mt-1 text-sm text-zinc-200 truncate ${mono ? "font-mono text-xs" : "font-semibold"}`}>
        {value}
      </p>
    </div>
  );
}

function RiskScoreBadge({ score }: { score: number }) {
  const label = score < 20 ? "LOW RISK" : score < 50 ? "MEDIUM RISK" : score < 75 ? "HIGH RISK" : "CRITICAL";
  const style =
    score < 20
      ? "bg-green-900/40 text-green-300 border-green-800"
      : score < 50
      ? "bg-yellow-900/40 text-yellow-300 border-yellow-800"
      : score < 75
      ? "bg-orange-900/40 text-orange-300 border-orange-800"
      : "bg-red-900/40 text-red-300 border-red-800";
  return (
    <div className={`rounded-xl border px-3 py-1.5 text-center ${style}`}>
      <div className="text-lg font-black">{score}</div>
      <div className="text-[10px] font-bold">{label}</div>
    </div>
  );
}

function RiskCardView({ card }: { card: RiskCard }) {
  return (
    <div className="space-y-4">
      <RiskSection title="Permissions">
        <RiskRow label="Owner / admin keys" value={card.permissions.hasOwnerKey} invert />
        <RiskRow label="Can mint more supply" value={card.permissions.canMint} invert />
        <RiskRow label="Can pause transfers" value={card.permissions.canPause} invert />
        <RiskRow label="Can upgrade logic" value={card.permissions.canUpgrade} invert />
        <RiskRow label="Has timelocks" value={card.permissions.hasTimelocks} />
      </RiskSection>

      <RiskSection title="Token Economics">
        <div className="text-sm text-zinc-300">
          Max supply: <span className="font-mono">{Number(card.tokenEconomics.maxSupply).toLocaleString()}</span>
        </div>
        <div className="text-sm text-zinc-300">
          Decimals: <span className="font-mono">{card.tokenEconomics.decimals}</span>
        </div>
        {card.tokenEconomics.transferRestrictions && (
          <div className="text-sm text-yellow-400">⚠ Transfer restrictions: {card.tokenEconomics.transferRestrictions}</div>
        )}
        {card.tokenEconomics.initialDistributionNotes && (
          <div className="text-sm text-zinc-400">{card.tokenEconomics.initialDistributionNotes}</div>
        )}
      </RiskSection>

      <RiskSection title="Release Integrity">
        <RiskRow label="Build hash recorded" value={card.releaseIntegrity.buildHashRecorded} />
        {card.releaseIntegrity.contractMatchesArtifact !== null && (
          <RiskRow label="Contract matches artifact" value={card.releaseIntegrity.contractMatchesArtifact} />
        )}
        {card.releaseIntegrity.auditSummary && (
          <div className="text-sm text-zinc-400">{card.releaseIntegrity.auditSummary}</div>
        )}
      </RiskSection>
    </div>
  );
}

function RiskSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-800 p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-zinc-500">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function RiskRow({ label, value, invert }: { label: string; value: boolean; invert?: boolean }) {
  const isRisky = invert ? value : !value;
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-zinc-300">{label}</span>
      <span className={`font-semibold ${isRisky ? "text-red-400" : "text-green-400"}`}>
        {value ? "Yes" : "No"}
      </span>
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
