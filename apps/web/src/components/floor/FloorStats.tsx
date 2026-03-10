"use client";

import type { FloorStatsDTO } from "@opfun/shared";

interface Props {
  stats: FloorStatsDTO;
}

export function FloorStats({ stats }: Props) {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-[var(--text-secondary)]">
      <span className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
        <strong className="text-[var(--text-primary)]">{stats.activeUsers}</strong> in the room
      </span>
      <span className="rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1">
        <strong className="text-[var(--text-primary)]">{stats.totalCallouts}</strong> callouts
      </span>
      <span className="rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1">
        <strong className="text-[var(--text-primary)]">{stats.totalMessages}</strong> messages
      </span>
    </div>
  );
}
