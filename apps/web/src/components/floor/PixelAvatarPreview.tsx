"use client";

import type { CSSProperties } from "react";
import {
  AVATAR_LOADOUT_DEFAULT,
  normalizeAvatarLoadout,
  type AvatarLoadout,
} from "./avatarCustomization";

type CharacterName = "Adam" | "Alex" | "Amelia" | "Bob";

const CHARACTER_NAMES: CharacterName[] = ["Adam", "Alex", "Amelia", "Bob"];

const SPRITE_BY_AVATAR_ID: Record<string, CharacterName> = {
  "sprite-adam": "Adam",
  "sprite-alex": "Alex",
  "sprite-amelia": "Amelia",
  "sprite-bob": "Bob",
  "default-free-1": "Adam",
  "default-free-2": "Alex",
  "default-free-3": "Amelia",
  "default-free-4": "Bob",
  "achievement-founder": "Adam",
  "achievement-caller": "Alex",
  "achievement-og": "Amelia",
  "paid-degen": "Bob",
  "paid-whale": "Adam",
  "paid-laser": "Alex",
};

interface Props {
  avatarId: string;
  walletAddress?: string;
  loadout?: AvatarLoadout | null;
  frameWidth?: number;
  className?: string;
  showShadow?: boolean;
}

export function PixelAvatarPreview({
  avatarId,
  walletAddress = "",
  loadout,
  frameWidth = 26,
  className,
  showShadow = true,
}: Props) {
  const nextLoadout = normalizeAvatarLoadout(loadout ?? AVATAR_LOADOUT_DEFAULT);
  const frameHeight = frameWidth * 2;
  const spriteName = resolveCharacterName(avatarId, walletAddress);
  const spriteStyle: CSSProperties = {
    width: frameWidth,
    height: frameHeight,
    backgroundImage: `url(/sprites/characters/${spriteName}_idle_16x16.png)`,
    backgroundSize: `${frameWidth * 4}px ${frameHeight}px`,
    backgroundPosition: "0px 0",
    backgroundRepeat: "no-repeat",
    imageRendering: "pixelated",
  };

  return (
    <div
      className={`relative ${className ?? ""}`}
      style={{ width: frameWidth, height: frameHeight + (showShadow ? 8 : 0) }}
    >
      <div className="relative" style={{ width: frameWidth, height: frameHeight }}>
        {showShadow && (
          <div
            className="absolute bottom-0 left-1/2 rounded-full bg-black/20"
            style={{
              width: Math.round(frameWidth * 0.7),
              height: Math.max(4, Math.round(frameWidth * 0.18)),
              transform: "translateX(-50%)",
            }}
          />
        )}
        <div className="absolute left-0 top-0" style={spriteStyle} />
        {renderHat(nextLoadout.hat, frameWidth)}
        {renderGlasses(nextLoadout.glasses, frameWidth)}
        {renderAccessory(nextLoadout.accessory, frameWidth)}
        {renderChain(nextLoadout.chain, frameWidth)}
        {renderPants(nextLoadout.pants, frameWidth)}
        {renderShoes(nextLoadout.shoes, frameWidth)}
      </div>
    </div>
  );
}

function renderHat(id: string, frameWidth: number) {
  if (id === "none") return null;
  if (id === "bull-cap") {
    return (
      <>
        {pixelLayer(frameWidth, { left: 1, top: 3, width: 5, height: 8, color: "#7a5129" })}
        {pixelLayer(frameWidth, { left: 5, top: 1, width: 6, height: 10, color: "#99632f" })}
        {pixelLayer(frameWidth, { left: 11, top: 3, width: 5, height: 8, color: "#7a5129" })}
        {pixelLayer(frameWidth, { left: 4, top: 10, width: 8, height: 2, color: "#4b2f14" })}
        {pixelLayer(frameWidth, { left: 2, top: 2, width: 2, height: 2, color: "#e7d9b4" })}
        {pixelLayer(frameWidth, { left: 12, top: 2, width: 2, height: 2, color: "#e7d9b4" })}
      </>
    );
  }
  if (id === "beanie") {
    return (
      <>
        {pixelLayer(frameWidth, { left: 3, top: 1, width: 10, height: 9, color: "#4a854b" })}
        {pixelLayer(frameWidth, { left: 2, top: 9, width: 12, height: 3, color: "#315932" })}
      </>
    );
  }
  return (
    <>
      {pixelLayer(frameWidth, { left: 3, top: 3, width: 10, height: 7, color: "#245336" })}
      {pixelLayer(frameWidth, { left: 2, top: 9, width: 12, height: 2, color: "#1a311f" })}
      {pixelLayer(frameWidth, { left: 5, top: 10, width: 6, height: 2, color: "#d0bb61" })}
    </>
  );
}

function renderGlasses(id: string, frameWidth: number) {
  if (id === "none") return null;
  if (id === "visor") {
    return pixelLayer(frameWidth, {
      left: 3,
      top: 12,
      width: 10,
      height: 3,
      color: "#335f8d",
    });
  }
  if (id === "square") {
    return (
      <>
        {pixelLayer(frameWidth, { left: 3, top: 12, width: 4, height: 3, color: "#505d73" })}
        {pixelLayer(frameWidth, { left: 9, top: 12, width: 4, height: 3, color: "#505d73" })}
        {pixelLayer(frameWidth, { left: 7, top: 13, width: 2, height: 1, color: "#273142" })}
      </>
    );
  }
  return (
    <>
      {pixelLayer(frameWidth, { left: 2, top: 12, width: 5, height: 3, color: "#252736" })}
      {pixelLayer(frameWidth, { left: 9, top: 12, width: 5, height: 3, color: "#252736" })}
      {pixelLayer(frameWidth, { left: 7, top: 13, width: 2, height: 1, color: "#252736" })}
    </>
  );
}

function renderAccessory(id: string, frameWidth: number) {
  if (id === "none") return null;
  if (id === "headset") {
    return (
      <>
        {pixelLayer(frameWidth, { left: 1, top: 11, width: 2, height: 5, color: "#6d727a" })}
        {pixelLayer(frameWidth, { left: 2, top: 15, width: 6, height: 1, color: "#6d727a" })}
      </>
    );
  }
  if (id === "badge") {
    return pixelLayer(frameWidth, {
      left: 10,
      top: 20,
      width: 3,
      height: 3,
      color: "#d2ad3f",
    });
  }
  return pixelLayer(frameWidth, {
    left: 10,
    top: 18,
    width: 4,
    height: 2,
    color: "#7d4b29",
  });
}

function renderChain(id: string, frameWidth: number) {
  if (id === "none") return null;
  const color = id === "silver" ? "#c5ccd6" : id === "opstreet" ? "#f0b31d" : "#f1cf4b";
  return (
    <>
      {pixelLayer(frameWidth, { left: 5, top: 18, width: 1, height: 3, color })}
      {pixelLayer(frameWidth, { left: 10, top: 18, width: 1, height: 3, color })}
      {pixelLayer(frameWidth, { left: 6, top: 20, width: 4, height: 1, color })}
    </>
  );
}

function renderPants(id: string, frameWidth: number) {
  if (id === "default") return null;
  const color = id === "cream" ? "#d8c79b" : id === "charcoal" ? "#484d59" : "#4f7eb7";
  return (
    <>
      {pixelLayer(frameWidth, { left: 5, top: 21, width: 3, height: 8, color })}
      {pixelLayer(frameWidth, { left: 8, top: 21, width: 3, height: 8, color })}
    </>
  );
}

function renderShoes(id: string, frameWidth: number) {
  if (id === "default") return null;
  const color =
    id === "loafers" ? "#7b5434" : id === "sneakers" ? "#5a77a1" : id === "boots" ? "#383029" : "#644b3c";
  return (
    <>
      {pixelLayer(frameWidth, { left: 4, top: 30, width: 4, height: 2, color })}
      {pixelLayer(frameWidth, { left: 9, top: 30, width: 4, height: 2, color })}
    </>
  );
}

function pixelLayer(
  frameWidth: number,
  config: { left: number; top: number; width: number; height: number; color: string },
) {
  const scale = frameWidth / 16;
  return (
    <div
      key={`${config.left}-${config.top}-${config.width}-${config.height}-${config.color}`}
      className="absolute"
      style={{
        left: config.left * scale,
        top: config.top * scale,
        width: config.width * scale,
        height: config.height * scale,
        background: config.color,
        imageRendering: "pixelated",
      }}
    />
  );
}

function resolveCharacterName(avatarId: string, walletAddress: string): CharacterName {
  const mapped = SPRITE_BY_AVATAR_ID[avatarId];
  if (mapped) return mapped;
  return CHARACTER_NAMES[hashStr(walletAddress || avatarId) % CHARACTER_NAMES.length]!;
}

function hashStr(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}
