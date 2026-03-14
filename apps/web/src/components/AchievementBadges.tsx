"use client";

import { useState, useEffect } from "react";
import { getApiBase } from "@/lib/apiBase";

const API = typeof window !== "undefined" ? getApiBase() : "";

interface Badge {
  id: string;
  name: string;
  description: string;
  emoji: string;
  earned: boolean;
}

interface AchievementsData {
  walletAddress: string;
  calloutsCount: number;
  tokensCreated: number;
  badges: Badge[];
}

export function AchievementBadges({ walletAddress }: { walletAddress: string }) {
  const [data, setData] = useState<AchievementsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!walletAddress) return;
    fetch(`${API}/auth/me/achievements`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [walletAddress]);

  if (loading || !data) return null;

  const earned = data.badges.filter((b) => b.earned);

  return (
    <div className="op-panel p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-black text-[var(--text-muted)]">Your Achievements</span>
        <span className="text-xs text-[var(--text-muted)]">
          {earned.length}/{data.badges.length} earned
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {data.badges.map((badge) => (
          <div
            key={badge.id}
            title={badge.description}
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-opacity ${
              badge.earned
                ? "border-2 border-ink bg-opYellow/25 text-ink"
                : "border-2 border-ink/30 bg-[var(--cream)] text-[var(--text-muted)] opacity-60"
            }`}
          >
            <span>{badge.emoji}</span>
            <span>{badge.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
