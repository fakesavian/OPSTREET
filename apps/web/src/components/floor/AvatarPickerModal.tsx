"use client";

import { useState } from "react";
import type { AvatarCatalogDTO } from "@opfun/shared";
import { equipAvatar } from "@/lib/api";

interface Props {
  walletAddress: string;
  avatars: AvatarCatalogDTO[];
  onEquipped: (avatarId: string) => void;
  onClose: () => void;
}

export function AvatarPickerModal({ walletAddress, avatars, onEquipped, onClose }: Props) {
  const [equipping, setEquipping] = useState<string | null>(null);
  const [error, setError] = useState("");

  const freeAvatars = avatars.filter((a) => a.tier === "FREE");
  const achievementAvatars = avatars.filter((a) => a.tier === "ACHIEVEMENT");
  const paidAvatars = avatars.filter((a) => a.tier === "PAID");

  async function handleEquip(avatarId: string) {
    setEquipping(avatarId);
    setError("");
    try {
      await equipAvatar(avatarId, walletAddress);
      onEquipped(avatarId);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEquipping(null);
    }
  }

  function AvatarGrid({ items, label }: { items: AvatarCatalogDTO[]; label: string }) {
    if (items.length === 0) return null;
    return (
      <div>
        <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-zinc-500">{label}</p>
        <div className="grid grid-cols-4 gap-2">
          {items.map((a) => {
            const isLocked = !a.owned && a.tier !== "FREE";
            const isPaid = a.tier === "PAID";
            return (
              <div
                key={a.id}
                className={`flex flex-col items-center gap-1 rounded-xl border-2 p-2 transition-colors ${
                  a.active
                    ? "border-brand-500 bg-brand-950"
                    : isLocked
                    ? "border-zinc-800 bg-zinc-900 opacity-60"
                    : "border-zinc-700 bg-zinc-800"
                }`}
              >
                <div
                  className={`${a.bgColor} flex h-10 w-10 items-center justify-center rounded-full text-xl border-2 border-white/10 relative`}
                >
                  {a.emoji}
                  {isLocked && (
                    <span className="absolute -top-1 -right-1 text-xs">🔒</span>
                  )}
                </div>
                <span className="text-[9px] text-zinc-400 text-center leading-tight">{a.name}</span>
                {a.active ? (
                  <span className="text-[9px] font-bold text-brand-400">Active</span>
                ) : isPaid && isLocked ? (
                  <span className="text-[9px] text-zinc-600">Coming soon</span>
                ) : isLocked ? (
                  <span className="text-[9px] text-zinc-600 text-center leading-tight">
                    {a.unlockCondition?.replace(/_/g, " ")}
                  </span>
                ) : (
                  <button
                    onClick={() => handleEquip(a.id)}
                    disabled={equipping === a.id}
                    className="rounded border border-brand-700 bg-brand-900 px-2 py-0.5 text-[9px] font-bold text-brand-300 hover:bg-brand-800 transition-colors disabled:opacity-50"
                  >
                    {equipping === a.id ? "…" : "Equip"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="relative w-full max-w-md rounded-2xl border-2 border-zinc-700 bg-zinc-900 p-6 flex flex-col gap-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-zinc-500 hover:text-white text-lg"
          aria-label="Close"
        >
          ✕
        </button>

        <h2 className="text-lg font-black text-white">Avatar Catalog</h2>

        <AvatarGrid items={freeAvatars} label="Free" />
        <AvatarGrid items={achievementAvatars} label="Achievements" />
        <AvatarGrid items={paidAvatars} label="Premium (Coming soon)" />

        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </div>
  );
}
