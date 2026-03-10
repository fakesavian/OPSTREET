import type { FloorStatsDTO } from "@opfun/shared";

interface Props {
  stats: FloorStatsDTO | null;
  clansTotal: number;
}

export function LiveActivitySection({ stats, clansTotal }: Props) {
  return (
    <div className="px-5 py-3 flex flex-wrap gap-2 items-center">
      <span className="op-pill op-pill-active font-bold flex items-center gap-1.5 text-[11px]">
        <span className="h-2 w-2 rounded-full bg-opGreen animate-pulse inline-block" />
        Live on Testnet
      </span>
      <span className="op-pill op-pill-active font-bold text-[11px]">
        Active players: {stats?.activeUsers ?? 0}
      </span>
      <span className="op-pill op-pill-active font-bold text-[11px]">
        Callouts today: {stats?.totalCallouts ?? 0}
      </span>
      <span className="op-pill op-pill-active font-bold text-[11px]">
        Active clans: {clansTotal}
      </span>
    </div>
  );
}
