import type { FloorCalloutDTO, FloorTickerDTO } from "@opfun/shared";

interface Props {
  callouts: FloorCalloutDTO[];
  ticker: FloorTickerDTO[];
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export function LiveFeedStrip({ callouts, ticker }: Props) {
  const hasContent = callouts.length > 0 || ticker.length > 0;

  return (
    <section className="mt-8 op-panel p-6">
      <h2 className="text-lg font-black text-ink mb-4 uppercase tracking-wider">
        Live Feed
      </h2>

      {!hasContent && (
        <p className="text-sm text-[var(--text-muted)]">No recent activity</p>
      )}

      {hasContent && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Latest Callouts */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-muted)] mb-3">
              Latest Callouts
            </h3>
            <div className="space-y-2">
              {callouts.length === 0 && (
                <p className="text-xs text-[var(--text-muted)]">No callouts yet</p>
              )}
              {callouts.slice(0, 5).map((c) => (
                <div
                  key={c.id}
                  className="flex items-start gap-2 p-2 rounded-lg border-2 border-ink/10 bg-[var(--panel-cream)]"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-ink truncate">
                        {c.displayName}
                      </span>
                      {c.projectTicker && (
                        <span className="op-pill text-[9px] py-0 px-1.5 border-ink/40">
                          ${c.projectTicker}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)] truncate mt-0.5">
                      {c.content}
                    </p>
                  </div>
                  <span className="text-[9px] font-bold text-[var(--text-muted)] shrink-0">
                    {timeAgo(c.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Trades (Ticker) */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-muted)] mb-3">
              Recent Trades
            </h3>
            <div className="space-y-2">
              {ticker.length === 0 && (
                <p className="text-xs text-[var(--text-muted)]">No trades yet</p>
              )}
              {ticker.slice(0, 5).map((t) => (
                (() => {
                  const priceDelta = t.priceDelta24h ?? "";
                  return (
                <div
                  key={t.id}
                  className="flex items-center gap-2 p-2 rounded-lg border-2 border-ink/10 bg-[var(--panel-cream)]"
                >
                  <span className="text-xs font-black text-ink">${t.ticker}</span>
                  <span className="text-[10px] text-[var(--text-muted)] truncate flex-1">
                    {t.name}
                  </span>
                  <span
                    className={`text-[10px] font-black ${
                      priceDelta.startsWith("+")
                        ? "text-[var(--green)]"
                        : priceDelta.startsWith("-")
                          ? "text-[var(--red)]"
                          : "text-[var(--text-muted)]"
                    }`}
                  >
                    {priceDelta || "0.0%"}
                  </span>
                  <span className="op-pill text-[9px] py-0 px-1.5 border-ink/40">
                    {t.status}
                  </span>
                </div>
                  );
                })()
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
