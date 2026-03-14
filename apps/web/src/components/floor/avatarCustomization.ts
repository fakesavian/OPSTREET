"use client";

export type AvatarLoadoutSlot = "hat" | "glasses" | "accessory" | "chain" | "pants" | "shoes";

export interface AvatarCustomizationOption {
  id: string;
  label: string;
  swatchClass: string;
}

export interface AvatarLoadout {
  hat: string;
  glasses: string;
  accessory: string;
  chain: string;
  pants: string;
  shoes: string;
}

export const AVATAR_CUSTOMIZATION_OPTIONS: Record<AvatarLoadoutSlot, AvatarCustomizationOption[]> = {
  hat: [
    { id: "none", label: "None", swatchClass: "bg-[var(--panel-cream)]" },
    { id: "trader-cap", label: "Trader Cap", swatchClass: "bg-[#27553c]" },
    { id: "beanie", label: "Beanie", swatchClass: "bg-[#4d8a4e]" },
    { id: "bull-cap", label: "Bull Cap", swatchClass: "bg-[#704b24]" },
  ],
  glasses: [
    { id: "none", label: "None", swatchClass: "bg-[var(--panel-cream)]" },
    { id: "shades", label: "Shades", swatchClass: "bg-[#2a2c38]" },
    { id: "square", label: "Square", swatchClass: "bg-[#495569]" },
    { id: "visor", label: "Visor", swatchClass: "bg-[#365e8f]" },
  ],
  accessory: [
    { id: "none", label: "None", swatchClass: "bg-[var(--panel-cream)]" },
    { id: "cigar", label: "Cigar", swatchClass: "bg-[#7a4b28]" },
    { id: "headset", label: "Headset", swatchClass: "bg-[#71757c]" },
    { id: "badge", label: "Badge", swatchClass: "bg-[#c2942c]" },
  ],
  chain: [
    { id: "none", label: "None", swatchClass: "bg-[var(--panel-cream)]" },
    { id: "gold", label: "Gold", swatchClass: "bg-[#f1cf4b]" },
    { id: "silver", label: "Silver", swatchClass: "bg-[#c7ced9]" },
    { id: "opstreet", label: "OpStreet", swatchClass: "bg-[#f3b81f]" },
  ],
  pants: [
    { id: "default", label: "Default", swatchClass: "bg-[#7384ad]" },
    { id: "denim", label: "Denim", swatchClass: "bg-[#4b77b3]" },
    { id: "charcoal", label: "Charcoal", swatchClass: "bg-[#454a58]" },
    { id: "cream", label: "Cream", swatchClass: "bg-[#d9caa2]" },
  ],
  shoes: [
    { id: "default", label: "Default", swatchClass: "bg-[#6a4f3e]" },
    { id: "loafers", label: "Loafers", swatchClass: "bg-[#7d5435]" },
    { id: "sneakers", label: "Sneakers", swatchClass: "bg-[#6d86af]" },
    { id: "boots", label: "Boots", swatchClass: "bg-[#3a312b]" },
  ],
};

export const AVATAR_LOADOUT_DEFAULT: AvatarLoadout = {
  hat: "none",
  glasses: "none",
  accessory: "none",
  chain: "none",
  pants: "default",
  shoes: "default",
};

export function getAvatarLoadoutStorageKey(walletAddress: string): string {
  return `opstreet:avatar-loadout:${walletAddress.toLowerCase()}`;
}

export function readAvatarLoadout(walletAddress?: string | null): AvatarLoadout {
  if (!walletAddress || typeof window === "undefined") return AVATAR_LOADOUT_DEFAULT;
  try {
    const raw = window.localStorage.getItem(getAvatarLoadoutStorageKey(walletAddress));
    if (!raw) return AVATAR_LOADOUT_DEFAULT;
    const parsed = JSON.parse(raw) as Partial<AvatarLoadout>;
    return normalizeAvatarLoadout(parsed);
  } catch {
    return AVATAR_LOADOUT_DEFAULT;
  }
}

export function writeAvatarLoadout(walletAddress: string, loadout: AvatarLoadout): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    getAvatarLoadoutStorageKey(walletAddress),
    JSON.stringify(normalizeAvatarLoadout(loadout)),
  );
  window.dispatchEvent(
    new CustomEvent("opstreet:avatar-loadout-updated", {
      detail: { walletAddress },
    }),
  );
}

export function normalizeAvatarLoadout(loadout?: Partial<AvatarLoadout> | null): AvatarLoadout {
  const next = { ...AVATAR_LOADOUT_DEFAULT, ...(loadout ?? {}) };
  return {
    hat: resolveAvatarOption("hat", next.hat),
    glasses: resolveAvatarOption("glasses", next.glasses),
    accessory: resolveAvatarOption("accessory", next.accessory),
    chain: resolveAvatarOption("chain", next.chain),
    pants: resolveAvatarOption("pants", next.pants),
    shoes: resolveAvatarOption("shoes", next.shoes),
  };
}

export function cycleAvatarOption(
  slot: AvatarLoadoutSlot,
  currentId: string,
  direction: -1 | 1,
): string {
  const options = AVATAR_CUSTOMIZATION_OPTIONS[slot];
  const currentIndex = Math.max(0, options.findIndex((option) => option.id === currentId));
  const nextIndex = (currentIndex + direction + options.length) % options.length;
  return options[nextIndex]!.id;
}

export function getAvatarOption(slot: AvatarLoadoutSlot, id: string): AvatarCustomizationOption {
  return (
    AVATAR_CUSTOMIZATION_OPTIONS[slot].find((option) => option.id === id) ??
    AVATAR_CUSTOMIZATION_OPTIONS[slot][0]!
  );
}

function resolveAvatarOption(slot: AvatarLoadoutSlot, id: string): string {
  return getAvatarOption(slot, id).id;
}
