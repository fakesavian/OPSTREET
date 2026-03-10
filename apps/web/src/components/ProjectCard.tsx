import type { ProjectDTO } from "@opfun/shared";

const STATUS_STYLES: Record<string, string> = {
  DRAFT:               "bg-ink/10 text-[var(--text-muted)]",
  CHECKING:            "bg-opYellow/30 text-ink",
  READY:               "bg-opGreen/20 text-opGreen",
  LAUNCHED:            "bg-opGreen/20 text-opGreen",
  FLAGGED:             "bg-opRed/20 text-opRed",
  GRADUATED:           "bg-opGreen/20 text-opGreen",
  DEPLOY_PACKAGE_READY:"bg-opYellow/30 text-ink",
};

export function ProjectCard({ project }: { project: ProjectDTO }) {
  const statusStyle = STATUS_STYLES[project.status] ?? STATUS_STYLES["DRAFT"]!;

  return (
    <a href={`/p/${project.slug}`} className="card group block">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base font-bold text-ink group-hover:text-opGreen transition-colors truncate">
              {project.name}
            </span>
            <span className="shrink-0 font-mono text-xs font-semibold text-[var(--text-muted)]">
              {project.ticker}
            </span>
          </div>
          <p className="text-sm text-[var(--text-muted)] line-clamp-2 leading-relaxed">
            {project.description}
          </p>
        </div>
        {project.riskScore !== null && (
          <RiskBadge score={project.riskScore} />
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-[var(--text-muted)]">
        <div className="flex items-center gap-2">
          <span className={`badge border-2 border-ink/20 ${statusStyle}`}>
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
      ? "bg-opGreen/20 text-opGreen border-opGreen/40"
      : score < 50
      ? "bg-opYellow/30 text-ink border-ink/30"
      : score < 75
      ? "bg-[#FED7AA] text-ink border-ink/30"
      : "bg-opRed/20 text-opRed border-opRed/40";
  return (
    <div className={`shrink-0 rounded-lg border-2 px-2 py-1 text-center ${style}`}>
      <div className="text-xs font-bold">{score}</div>
      <div className="text-[10px] font-semibold">{label}</div>
    </div>
  );
}
