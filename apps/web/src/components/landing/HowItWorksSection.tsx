const STEPS = [
  {
    num: 1,
    title: "Launch",
    desc: "Create an OP_20 token on Bitcoin L1 in minutes. Set your supply, ticker, and risk profile — then deploy.",
    bg: "bg-opYellow",
  },
  {
    num: 2,
    title: "Callout + Trade",
    desc: "Post trade callouts, join the live trading floor, and track momentum with real-time charts.",
    bg: "bg-[#D1FAE5]",
  },
  {
    num: 3,
    title: "Rank Up",
    desc: "Climb the leaderboard, earn achievement badges, form clans, and build your reputation on the street.",
    bg: "bg-[#E0E7FF]",
  },
] as const;

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="scroll-mt-20">
      <h2 className="text-xs font-black uppercase tracking-widest text-[var(--text-muted)] mb-4">
        How it works
      </h2>

      {/* Desktop: 3 cards in a row */}
      <div className="hidden sm:grid sm:grid-cols-3 gap-4">
        {STEPS.map((step) => (
          <div
            key={step.num}
            className="rounded-2xl border-3 border-ink bg-[var(--panel-cream)] shadow-[5px_5px_0_#111111] p-6 flex flex-col gap-4"
          >
            <div
              className={`w-11 h-11 rounded-full border-3 border-ink flex items-center justify-center font-black text-sm ${step.bg}`}
            >
              {step.num}
            </div>
            <p className="font-black text-base text-ink">{step.title}</p>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              {step.desc}
            </p>
          </div>
        ))}
      </div>

      {/* Mobile: stacked cards */}
      <div className="sm:hidden space-y-4">
        {STEPS.map((step) => (
          <div
            key={step.num}
            className="rounded-2xl border-3 border-ink bg-[var(--panel-cream)] shadow-[4px_4px_0_#111111] p-5 flex items-start gap-4"
          >
            <div
              className={`w-11 h-11 rounded-full border-3 border-ink flex items-center justify-center font-black text-sm shrink-0 ${step.bg}`}
            >
              {step.num}
            </div>
            <div>
              <p className="font-black text-base text-ink">{step.title}</p>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed mt-1.5">
                {step.desc}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
