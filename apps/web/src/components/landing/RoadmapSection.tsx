const PHASES = [
  {
    title: "Token Launchpad",
    description: "Create, audit, and deploy OP_20 tokens on Bitcoin L1.",
    status: "COMPLETE" as const,
  },
  {
    title: "Trading Floor & Clans",
    description: "Social trading, callouts, avatars, and clan battles.",
    status: "COMPLETE" as const,
  },
  {
    title: "Testnet Deploy & Live Trading",
    description: "Real contract deployment, live pool quotes, and indexed charts.",
    status: "IN PROGRESS" as const,
  },
  {
    title: "AMM & Liquidity Pools",
    description: "On-chain constant-product pools with graduation to MotoSwap AMM.",
    status: "UPCOMING" as const,
  },
  {
    title: "Mainnet Launch",
    description: "Full mainnet deployment with production security hardening.",
    status: "UPCOMING" as const,
  },
];

const STATUS_STYLES = {
  COMPLETE: "bg-opGreen text-white",
  "IN PROGRESS": "bg-opYellow text-ink animate-pulse",
  UPCOMING: "bg-gray-300 text-gray-600",
};

const DOT_STYLES = {
  COMPLETE: "bg-opGreen border-opGreen",
  "IN PROGRESS": "bg-opYellow border-opYellow",
  UPCOMING: "bg-gray-300 border-gray-400",
};

export function RoadmapSection() {
  return (
    <section className="op-panel p-6">
      <h2 className="text-lg font-black text-ink mb-6 uppercase tracking-wider">Roadmap</h2>

      {/* Desktop: horizontal */}
      <div className="hidden md:block">
        <div className="relative flex items-start justify-between">
          {/* Connecting line */}
          <div className="absolute top-5 left-5 right-5 h-1 bg-ink/20 rounded" />

          {PHASES.map((phase, i) => (
            <div key={i} className="relative flex flex-col items-center text-center" style={{ width: `${100 / PHASES.length}%` }}>
              {/* Node circle */}
              <div className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-3 border-ink ${DOT_STYLES[phase.status]}`}>
                <span className="text-sm font-black text-ink">{i + 1}</span>
              </div>
              <p className="mt-2 text-xs font-black text-ink">{phase.title}</p>
              <p className="mt-1 text-[10px] text-[var(--text-muted)] leading-snug max-w-[140px]">{phase.description}</p>
              <span className={`mt-2 inline-block rounded-full border-2 border-ink px-2 py-0.5 text-[9px] font-black ${STATUS_STYLES[phase.status]}`}>
                {phase.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Mobile: vertical */}
      <div className="md:hidden space-y-0">
        {PHASES.map((phase, i) => (
          <div key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full border-3 border-ink ${DOT_STYLES[phase.status]}`}>
                <span className="text-xs font-black text-ink">{i + 1}</span>
              </div>
              {i < PHASES.length - 1 && <div className="w-0.5 flex-1 bg-ink/20 my-1" />}
            </div>
            <div className="pb-4">
              <p className="text-xs font-black text-ink">{phase.title}</p>
              <p className="text-[10px] text-[var(--text-muted)] leading-snug mt-0.5">{phase.description}</p>
              <span className={`mt-1 inline-block rounded-full border-2 border-ink px-2 py-0.5 text-[9px] font-black ${STATUS_STYLES[phase.status]}`}>
                {phase.status}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 text-center">
        <a
          href="/docs"
          className="text-xs font-bold text-[var(--text-muted)] hover:text-ink transition-colors"
        >
          View Docs &rarr;
        </a>
      </div>
    </section>
  );
}
