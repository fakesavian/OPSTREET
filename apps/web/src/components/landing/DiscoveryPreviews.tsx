import Link from "next/link";
import type { LeaderboardRow, ClanDTO, ShopCatalogItemState } from "@/lib/api";

interface Props {
  earners: LeaderboardRow[];
  calloutLeaders: LeaderboardRow[];
  clans: ClanDTO[];
  shopItems: ShopCatalogItemState[];
}

function PreviewCard({
  title,
  linkHref,
  linkLabel,
  children,
}: {
  title: string;
  linkHref: string;
  linkLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border-3 border-ink bg-[var(--panel-cream)] p-4 shadow-[5px_5px_0_#111]">
      <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-muted)] mb-3">
        {title}
      </h3>
      {children}
      <Link
        href={linkHref}
        className="mt-3 inline-block text-[11px] font-black text-ink hover:underline"
      >
        {linkLabel} &rarr;
      </Link>
    </div>
  );
}

export function DiscoveryPreviews({
  earners,
  calloutLeaders,
  clans,
  shopItems,
}: Props) {
  return (
    <section className="mt-8">
      <div className="grid sm:grid-cols-2 gap-4">
        {/* Top Earners */}
        <PreviewCard title="Leaders" linkHref="/leaderboards" linkLabel="View All">
          {earners.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">No data yet</p>
          ) : (
            <div className="space-y-1.5">
              {earners.slice(0, 5).map((r) => (
                <div key={r.rank} className="flex items-center gap-2 text-xs">
                  <span className="w-5 text-right font-black text-[var(--text-muted)]">
                    #{r.rank}
                  </span>
                  <span className="font-bold text-ink truncate flex-1">
                    {r.displayName}
                  </span>
                  {r.realizedPnlSats != null && (
                    <span
                      className={`font-black ${
                        r.realizedPnlSats >= 0
                          ? "text-[var(--green)]"
                          : "text-[var(--red)]"
                      }`}
                    >
                      {r.realizedPnlSats >= 0 ? "+" : ""}
                      {r.realizedPnlSats.toLocaleString()} sats
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </PreviewCard>

        {/* Top Callout Players */}
        <PreviewCard title="Players" linkHref="/leaderboards" linkLabel="View All">
          {calloutLeaders.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">No data yet</p>
          ) : (
            <div className="space-y-1.5">
              {calloutLeaders.slice(0, 5).map((r) => (
                <div key={r.rank} className="flex items-center gap-2 text-xs">
                  <span className="w-5 text-right font-black text-[var(--text-muted)]">
                    #{r.rank}
                  </span>
                  <span className="font-bold text-ink truncate flex-1">
                    {r.displayName}
                  </span>
                  {r.calloutBestMultiple != null && (
                    <span className="font-black text-[var(--green)]">
                      {r.calloutBestMultiple.toFixed(1)}x
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </PreviewCard>

        {/* Clans */}
        <PreviewCard title="Clans" linkHref="/clans" linkLabel="Create / Join">
          {clans.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">No clans yet</p>
          ) : (
            <div className="space-y-1.5">
              {clans.slice(0, 5).map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-xs">
                  <span className="font-black text-ink">[{c.tag}]</span>
                  <span className="font-bold text-ink truncate flex-1">
                    {c.name}
                  </span>
                  <span className="text-[var(--text-muted)]">
                    {c.memberCount} members
                  </span>
                </div>
              ))}
            </div>
          )}
        </PreviewCard>

        {/* Shop */}
        <PreviewCard title="Shop" linkHref="/shop" linkLabel="Open Shop">
          {shopItems.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">No items yet</p>
          ) : (
            <div className="space-y-1.5">
              {shopItems.slice(0, 3).map((item) => (
                <div
                  key={item.itemKey}
                  className="flex items-center gap-2 text-xs"
                >
                  <span className="font-bold text-ink truncate flex-1">
                    {item.name}
                  </span>
                  <span className="text-[var(--text-muted)]">
                    {item.pricing.freeMint
                      ? "Free"
                      : `${item.pricing.amount} ${item.pricing.displayToken}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </PreviewCard>
      </div>
    </section>
  );
}
