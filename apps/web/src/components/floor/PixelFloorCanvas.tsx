"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import {
    DEMO_NPC_TRADERS,
    CHARACTER_NAMES,
    type NpcTrader,
    type CharacterName
} from "./pixelSpriteData";
import { preloadAllSprites, getSpriteSheet, getTileSheet } from "./spriteLoader";
import type { FloorPresenceDTO } from "@opfun/shared";

// ── Constants ─────────────────────────────────────────────────────────────────
const TILE_SCALE = 3;        // Each sprite pixel = 3 CSS pixels
const SPRITE_W = 16;         // Character sprite width
const SPRITE_H = 32;         // Character sprite height (unlike before, it's 32 tall)
const ANIM_INTERVAL = 150;   // ms between animation frames
const FLOOR_TILE_SIZE = 16;  // Floor tile dimensions in sprite pixels

// You can tweak these x/y indexes to pick a different floor tile from Room_Builder_free_16x16.png
// For example, row 5 (idx 4), col 2 (idx 1). 
const TILE_SRC_X = 16 * 1;
const TILE_SRC_Y = 16 * 4;
// And an alternate for checkering if desired
const ALT_TILE_SRC_X = 16 * 2;
const ALT_TILE_SRC_Y = 16 * 4;

const SPRITE_BY_AVATAR_ID: Record<string, CharacterName> = {
    "sprite-adam": "Adam",
    "sprite-alex": "Alex",
    "sprite-amelia": "Amelia",
    "sprite-bob": "Bob",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function hashStr(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
}

function seededRand(seed: number, offset: number): number {
    const x = Math.sin(seed + offset) * 10000;
    return x - Math.floor(x);
}

function resolveCharacterName(avatarId: string, walletAddress: string): CharacterName {
    const mapped = SPRITE_BY_AVATAR_ID[avatarId];
    if (mapped) return mapped;
    if ((CHARACTER_NAMES as readonly string[]).includes(avatarId)) {
        return avatarId as CharacterName;
    }
    const seed = hashStr(walletAddress);
    return CHARACTER_NAMES[seed % CHARACTER_NAMES.length]!;
}

/** 
 * Maps direction and tick to the 24-frame (or 4-frame) PNG sheets.
 * Assumption: Sheets are structured Right, Up, Left, Down.
 */
function getSpriteSource(state: "idle" | "run" | "idleAnim", facing: "up" | "down" | "left" | "right", animTick: number) {
    let dirIndex = 0;
    switch (facing) {
        case "right": dirIndex = 0; break;
        case "up": dirIndex = 1; break;
        case "left": dirIndex = 2; break;
        case "down": dirIndex = 3; break;
    }

    if (state === "idle") {
        // 4 frames total (64x32)
        return { sheet: "idle" as const, sx: dirIndex * SPRITE_W, sy: 0, sw: SPRITE_W, sh: SPRITE_H };
    } else {
        // run or idleAnim: 24 frames total (384x32) -> 6 per direction
        const frame = animTick % 6;
        const totalIndex = (dirIndex * 6) + frame;
        return { sheet: state, sx: totalIndex * SPRITE_W, sy: 0, sw: SPRITE_W, sh: SPRITE_H };
    }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
    presence: FloorPresenceDTO[];
    mobile?: boolean;
    spawnSeed?: number;
}

export function PixelFloorCanvas({ presence, mobile = false, spawnSeed = 0 }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [loaded, setLoaded] = useState(false);
    
    const animFrameRef = useRef(0);
    const rafIdRef = useRef(0);
    const lastAnimTimeRef = useRef(0);

    const MAX_AVATARS = mobile ? 12 : 30;
    const displayed = presence.slice(0, MAX_AVATARS);

    useEffect(() => {
        preloadAllSprites().then(() => setLoaded(true)).catch(console.error);
    }, []);

    const draw = useCallback(
        (timestamp: number) => {
            if (!loaded) return;
            const canvas = canvasRef.current;
            const container = containerRef.current;
            if (!canvas || !container) return;

            const dpr = window.devicePixelRatio || 1;
            const rect = container.getBoundingClientRect();
            const w = Math.round(rect.width);
            const h = Math.round(rect.height);

            if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
                canvas.width = w * dpr;
                canvas.height = h * dpr;
                canvas.style.width = `${w}px`;
                canvas.style.height = `${h}px`;
                
                // Keep the pixelated crisp look
                const ctx = canvas.getContext("2d");
                if (ctx) ctx.imageSmoothingEnabled = false;
            }

            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            ctx.imageSmoothingEnabled = false; // re-force on clear

            // Advance animation frame
            if (timestamp - lastAnimTimeRef.current > ANIM_INTERVAL) {
                animFrameRef.current++;
                lastAnimTimeRef.current = timestamp;
            }
            const animFrame = animFrameRef.current;

            ctx.save();
            ctx.scale(dpr, dpr);
            ctx.clearRect(0, 0, w, h);

            // ── 1. Tile the floor ───────────────────────────────────────────
            const floorScale = mobile ? TILE_SCALE - 1 : TILE_SCALE;
            const tileW = FLOOR_TILE_SIZE * floorScale;
            const tileH = FLOOR_TILE_SIZE * floorScale;
            const tileSheet = getTileSheet();

            if (tileSheet) {
                let colIdx = 0;
                for (let x = 0; x < w; x += tileW) {
                    let rowIdx = 0;
                    for (let y = 0; y < h; y += tileH) {
                        const useAlt = (colIdx + rowIdx) % 2 === 1;
                        const sx = useAlt ? ALT_TILE_SRC_X : TILE_SRC_X;
                        const sy = useAlt ? ALT_TILE_SRC_Y : TILE_SRC_Y;
                        ctx.drawImage(tileSheet, sx, sy, 16, 16, x, y, tileW, tileH);
                        rowIdx++;
                    }
                    colIdx++;
                }
            }

            // ── 2. Render Entities ───────────────────────────────────────
            const spriteScale = mobile ? 2 : 3;
            const spritePixelW = SPRITE_W * spriteScale;
            const spritePixelH = SPRITE_H * spriteScale;

            type Entity = { x: number; y: number; charName: CharacterName; facing: "up"|"down"|"left"|"right"; isUser: boolean; name: string; seed: number };
            const entities: Entity[] = [];

            // NPCs
            for (const npc of DEMO_NPC_TRADERS) {
                const margin = spritePixelW;
                const x = margin + npc.posX * (w - 2 * margin) - spritePixelW / 2;
                const y = margin / 2 + npc.posY * (h - margin - spritePixelH / 2) - spritePixelH / 2;
                entities.push({ x, y, charName: npc.charName, facing: npc.facing, isUser: false, name: npc.name, seed: 0 });
            }

            // Real users
            for (const entry of displayed) {
                const seed = hashStr(`${entry.walletAddress}:${spawnSeed}`);
                const charName = resolveCharacterName(entry.avatarId, entry.walletAddress);
                const posX = 0.08 + seededRand(seed, 0) * 0.84;
                const posY = 0.08 + seededRand(seed, 1) * 0.72;
                
                // Users face mostly down or bob randomly
                const dirRoll = seededRand(seed, 2);
                let facing: "down" | "right" | "left" | "up" = "down";
                if (dirRoll > 0.8) facing = "right";
                else if (dirRoll > 0.6) facing = "left";

                const margin = spritePixelW;
                const x = margin + posX * (w - 2 * margin) - spritePixelW / 2;
                const y = margin / 2 + posY * (h - margin - spritePixelH / 2) - spritePixelH / 2;
                
                const displayName = (entry.displayName || entry.walletAddress.slice(0, 6)).slice(0, 8);
                entities.push({ x, y, charName, facing, isUser: true, name: displayName, seed });
            }

            // Sort by Y for depth ordering
            entities.sort((a, b) => (a.y + spritePixelH) - (b.y + spritePixelH));

            // Draw Entities
            for (const entity of entities) {
                // Let's use idleAnim for everyone so they are breathing slightly, 
                // but we offset the animFrame with their seed so they don't sync up perfectly.
                const tickOffset = entity.seed % 6;
                const src = getSpriteSource("idleAnim", entity.facing, animFrame + tickOffset);
                const sheet = getSpriteSheet(entity.charName, src.sheet);

                if (sheet) {
                    ctx.drawImage(sheet, src.sx, src.sy, src.sw, src.sh, entity.x, entity.y, spritePixelW, spritePixelH);
                }

                // Name label below sprite
                const labelY = entity.y + spritePixelH + 2;
                const labelX = entity.x + spritePixelW / 2;
                ctx.font = `bold ${mobile ? 7 : 8}px monospace`;
                ctx.textAlign = "center";

                const textMetrics = ctx.measureText(entity.name);
                const pillW = textMetrics.width + 6;
                const pillH = mobile ? 9 : 11;
                ctx.fillStyle = "rgba(10, 10, 10, 0.75)";
                ctx.beginPath();
                ctx.roundRect(labelX - pillW / 2, labelY, pillW, pillH, 2);
                ctx.fill();

                ctx.fillStyle = entity.isUser ? "#67e8f9" : "#D4D4D8"; // Cyan for real users, silver for NPCs
                ctx.fillText(entity.name, labelX, labelY + (mobile ? 7 : 9));
            }

            // ── 3. Edge vignette ────────────────────────────────────────────
            const topGrad = ctx.createLinearGradient(0, 0, 0, h * 0.15);
            topGrad.addColorStop(0, "rgba(10, 8, 5, 0.6)");
            topGrad.addColorStop(1, "rgba(10, 8, 5, 0)");
            ctx.fillStyle = topGrad;
            ctx.fillRect(0, 0, w, h * 0.15);

            const botGrad = ctx.createLinearGradient(0, h * 0.85, 0, h);
            botGrad.addColorStop(0, "rgba(10, 8, 5, 0)");
            botGrad.addColorStop(1, "rgba(10, 8, 5, 0.7)");
            ctx.fillStyle = botGrad;
            ctx.fillRect(0, h * 0.85, w, h * 0.15);

            const lGrad = ctx.createLinearGradient(0, 0, w * 0.06, 0);
            lGrad.addColorStop(0, "rgba(10, 8, 5, 0.5)");
            lGrad.addColorStop(1, "rgba(10, 8, 5, 0)");
            ctx.fillStyle = lGrad;
            ctx.fillRect(0, 0, w * 0.06, h);

            const rGrad = ctx.createLinearGradient(w * 0.94, 0, w, 0);
            rGrad.addColorStop(0, "rgba(10, 8, 5, 0)");
            rGrad.addColorStop(1, "rgba(10, 8, 5, 0.5)");
            ctx.fillStyle = rGrad;
            ctx.fillRect(w * 0.94, 0, w * 0.06, h);

            ctx.restore();

            rafIdRef.current = requestAnimationFrame(draw);
        },
        [displayed, mobile, loaded, spawnSeed],
    );

    useEffect(() => {
        if (loaded) {
            rafIdRef.current = requestAnimationFrame(draw);
        }
        return () => cancelAnimationFrame(rafIdRef.current);
    }, [draw, loaded]);

    return (
        <div ref={containerRef} className="absolute inset-0 overflow-hidden" style={{ imageRendering: "pixelated" }}>
            <canvas ref={canvasRef} className="block w-full h-full" style={{ imageRendering: "pixelated" }} />
        </div>
    );
}
