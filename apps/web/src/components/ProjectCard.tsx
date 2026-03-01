import type { ProjectDTO } from "@opfun/shared";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-zinc-800 text-zinc-400",
  CHECKING: "bg-yellow-900/60 text-yellow-300",
  READY: "bg-blue-900/60 text-blue-300",
  LAUNCHED: "bg-green-900/60 text-green-300",
  FLAGGED: "bg-red-900/60 text-red-300",
  GRADUATED: "bg-purple-900/60 text-purple-300",
};

export function ProjectCard({ project }: { project: ProjectDTO }) {
  const statusStyle = STATUS_STYLES[project.status] ?? STATUS_STYLES["DRAFT"]!;

  return (
    <a href={`/p/${project.slug}`} className="card group block">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base font-bold text-white group-hover:text-brand-400 transition-colors truncate">
              {project.name}
            </span>
            <span className="shrink-0 font-mono text-xs font-semibold text-zinc-500">
              {project.ticker}
            </span>
          </div>
          <p className="text-sm text-zinc-400 line-clamp-2 leading-relaxed">
            {project.description}
          </p>
        </div>
        {project.riskScore !== null && (
          <RiskBadge score={project.riskScore} />
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
        <div className="flex items-center gap-2">
          <span className={`badge ${statusStyle}`}>
            {project.status === "FLAGGED" && "⚠ "}
            {project.status}
          </span>
          <span className="font-mono">{project.ticker}</span>
          <span>·</span>
          <span>{project.network}</span>
        </div>
        <time dateTime={project.createdAt}>
          {new Date(project.createdAt).toLocaleDateString()}
        </time>
      </div>
    </a>
  );
}

function RiskBadge({ score }: { score: number }) {
  const label = score < 20 ? "LOW" : score < 50 ? "MED" : score < 75 ? "HIGH" : "CRIT";
  const style =
    score < 20
      ? "bg-green-900/60 text-green-300"
      : score < 50
      ? "bg-yellow-900/60 text-yellow-300"
      : score < 75
      ? "bg-orange-900/60 text-orange-300"
      : "bg-red-900/60 text-red-300";
  return (
    <div className={`shrink-0 rounded-lg px-2 py-1 text-center ${style}`}>
      <div className="text-xs font-bold">{score}</div>
      <div className="text-[10px] font-semibold">{label}</div>
    </div>
  );
}
