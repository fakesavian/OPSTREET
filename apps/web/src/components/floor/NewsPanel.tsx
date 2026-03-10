"use client";

export function NewsPanel() {
  return (
    <div className="card flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 items-center justify-between">
        <span className="text-xs font-black uppercase tracking-wider text-ink">News</span>
        <span className="rounded border-2 border-ink bg-opYellow/25 px-2 py-0.5 text-[10px] font-bold text-ink">
          Unavailable
        </span>
      </div>

      <div className="rounded-xl border-2 border-ink/20 bg-[var(--cream)] p-4 text-xs leading-relaxed text-[var(--text-muted)]">
        Live OP_NET news indexing is not wired in yet. This panel stays empty until a confirmed upstream feed is available.
      </div>
    </div>
  );
}
