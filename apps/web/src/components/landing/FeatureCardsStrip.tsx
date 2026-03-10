const FEATURES = [
  {
    title: "Create Token",
    desc: "Launch an OP_20 token on Bitcoin L1 in minutes.",
    circleCls: "bg-opYellow",
    icon: (
      <svg viewBox="0 0 28 28" fill="none" className="w-7 h-7">
        <circle cx="14" cy="14" r="11" stroke="#111" strokeWidth="2.5" fill="#FFD84D" />
        <text x="14" y="19" textAnchor="middle" fontSize="12" fontWeight="900" fill="#111">$</text>
      </svg>
    ),
  },
  {
    title: "Risk Card",
    desc: "Transparent risk scoring for every launched token.",
    circleCls: "bg-[#FED7AA]",
    icon: (
      <svg viewBox="0 0 28 28" fill="none" className="w-7 h-7">
        <path d="M14 4L25 23H3L14 4Z" stroke="#111" strokeWidth="2.5" fill="#FED7AA" strokeLinejoin="round" />
        <path d="M14 11V16" stroke="#111" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="14" cy="20" r="1.2" fill="#111" />
      </svg>
    ),
  },
  {
    title: "Trading Floor",
    desc: "Live social trading with callouts and real-time charts.",
    circleCls: "bg-[#D1FAE5]",
    icon: (
      <svg viewBox="0 0 28 28" fill="none" className="w-7 h-7">
        <rect x="3" y="3" width="22" height="22" rx="3" stroke="#111" strokeWidth="2.2" fill="#D1FAE5" />
        <path d="M7 19L11 13L16 17L21 9" stroke="#111" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Rewards & Avatars",
    desc: "Earn badges, level up, and customize your trader avatar.",
    circleCls: "bg-[#E0E7FF]",
    icon: (
      <svg viewBox="0 0 28 28" fill="none" className="w-7 h-7">
        <path d="M14 4L16.9 10.5H24L18.1 14.7L20.4 21.5L14 17.4L7.6 21.5L9.9 14.7L4 10.5H11.1L14 4Z" stroke="#111" strokeWidth="2.2" fill="#E0E7FF" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Callouts",
    desc: "Post trade callouts and build your reputation on the street.",
    circleCls: "bg-[#FEE2E2]",
    icon: (
      <svg viewBox="0 0 28 28" fill="none" className="w-7 h-7">
        <path d="M4 6C4 4.9 4.9 4 6 4H22C23.1 4 24 4.9 24 6V18C24 19.1 23.1 20 22 20H16L11 24V20H6C4.9 20 4 19.1 4 18V6Z" stroke="#111" strokeWidth="2.2" fill="#FEE2E2" strokeLinejoin="round" />
        <path d="M9 11H19M9 15H15" stroke="#111" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
] as const;

export function FeatureCardsStrip() {
  return (
    <section>
      <h2 className="text-xs font-black uppercase tracking-widest text-[var(--text-muted)] mb-4">
        Key Features
      </h2>

      {/* Desktop: 3+2 grid */}
      <div className="hidden sm:grid sm:grid-cols-3 gap-4">
        {FEATURES.map((feat) => (
          <div
            key={feat.title}
            className="rounded-2xl border-3 border-ink bg-[var(--panel-cream)] shadow-[4px_4px_0_#111111] p-5 flex flex-col gap-3 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#111111] transition-all"
          >
            <div
              className={`w-12 h-12 rounded-full border-3 border-ink flex items-center justify-center shrink-0 ${feat.circleCls}`}
            >
              {feat.icon}
            </div>
            <p className="font-black text-sm text-ink">{feat.title}</p>
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              {feat.desc}
            </p>
          </div>
        ))}
      </div>

      {/* Mobile: 2-column grid */}
      <div className="sm:hidden grid grid-cols-2 gap-3">
        {FEATURES.map((feat) => (
          <div
            key={feat.title}
            className="rounded-xl border-3 border-ink bg-[var(--panel-cream)] shadow-[3px_3px_0_#111111] p-4 flex flex-col gap-2.5"
          >
            <div
              className={`w-10 h-10 rounded-full border-3 border-ink flex items-center justify-center shrink-0 ${feat.circleCls}`}
            >
              {feat.icon}
            </div>
            <p className="font-black text-xs text-ink">{feat.title}</p>
            <p className="text-[10px] text-[var(--text-muted)] leading-snug">
              {feat.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
