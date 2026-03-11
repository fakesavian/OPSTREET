"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import {
    DEMO_NPC_TRADERS,
    CHARACTER_NAMES,
    type CharacterName
} from "./pixelSpriteData";
import {
    preloadAllSprites,
    getSpriteSheet,
    getTileSheet,
    getFurnitureSheet,
    getExternalSprite,
    getNyseTileSheet,
} from "./spriteLoader";
import { FLOOR_FURNITURE, type FurnitureObject } from "./wallStreetObjects";
import type { FloorPresenceDTO } from "@opfun/shared";

// ── Constants ─────────────────────────────────────────────────────────────────
const TILE_SCALE    = 3;    // Each sprite pixel = 3 CSS pixels
const SPRITE_W      = 16;   // Character sprite width  (px in sprite sheet)
const SPRITE_H      = 32;   // Character sprite height
const ANIM_INTERVAL = 150;  // ms between animation frames
const FLOOR_TILE_SIZE = 16; // Floor tile dimensions in sprite pixels

// Classic tile coords in Room_Builder_free_16x16.png (fallback only)
const TILE_SRC_X     = 16 * 1;
const TILE_SRC_Y     = 16 * 4;
const ALT_TILE_SRC_X = 16 * 2;
const ALT_TILE_SRC_Y = 16 * 4;

const SPRITE_BY_AVATAR_ID: Record<string, CharacterName> = {
    "sprite-adam":  "Adam",
    "sprite-alex":  "Alex",
    "sprite-amelia":"Amelia",
    "sprite-bob":   "Bob",
};

// ── Types ─────────────────────────────────────────────────────────────────────

/** Floor tile style.
 * "nyse"    — NYSE trading floor (blonde wood aisle + dark charcoal sides + teal pit)  ← default
 * "zones"   — multi-zone WS luxury floor
 * "classic" — original Room_Builder tileset with checker pattern
 * Others    — single WS tile repeated across the whole floor
 */
export type FloorStyle =
    | "nyse"
    | "zones"
    | "classic"
    | "marble-white"
    | "marble-dark"
    | "cream-tile"
    | "walnut"
    | "oak"
    | "teal-carpet";

// WS floor tile coords within ws-floor-tiles.png (4 cols × 2 rows)
const WS_TILE: Record<string, { col: number; row: number }> = {
    "marble-white": { col: 0, row: 0 },
    "marble-dark":  { col: 1, row: 0 },
    "cream-tile":   { col: 2, row: 0 },
    "walnut":       { col: 3, row: 0 },
    "oak":          { col: 1, row: 1 },
    "teal-carpet":  { col: 2, row: 1 },
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

function getSpriteSource(
    state: "idle" | "run" | "idleAnim",
    facing: "up" | "down" | "left" | "right",
    animTick: number
) {
    let dirIndex = 0;
    switch (facing) {
        case "right": dirIndex = 0; break;
        case "up":    dirIndex = 1; break;
        case "left":  dirIndex = 2; break;
        case "down":  dirIndex = 3; break;
    }
    if (state === "idle") {
        return { sheet: "idle" as const, sx: dirIndex * SPRITE_W, sy: 0, sw: SPRITE_W, sh: SPRITE_H };
    }
    const frame = animTick % 6;
    const totalIndex = (dirIndex * 6) + frame;
    return { sheet: state, sx: totalIndex * SPRITE_W, sy: 0, sw: SPRITE_W, sh: SPRITE_H };
}

/**
 * Draw a single WS tile (by col/row in the 4×2 ws-floor-tiles sheet)
 * tiled across the rectangular region [rx, ry, rw, rh].
 */
function drawTileRegion(
    ctx: CanvasRenderingContext2D,
    sheet: HTMLImageElement,
    col: number,
    row: number,
    rx: number, ry: number, rw: number, rh: number,
    tileW: number, tileH: number,
) {
    const srcW = sheet.naturalWidth  / 4;
    const srcH = sheet.naturalHeight / 2;
    const sx   = col * srcW;
    const sy   = row * srcH;

    for (let x = rx; x < rx + rw; x += tileW) {
        for (let y = ry; y < ry + rh; y += tileH) {
            const dw = Math.min(tileW, rx + rw - x);
            const dh = Math.min(tileH, ry + rh - y);
            ctx.drawImage(sheet, sx, sy, srcW, srcH, x, y, dw, dh);
        }
    }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
    presence: FloorPresenceDTO[];
    mobile?: boolean;
    spawnSeed?: number;
    floorStyle?: FloorStyle;
    showFurniture?: boolean;
}

export function PixelFloorCanvas({
    presence,
    mobile = false,
    spawnSeed = 0,
    floorStyle = "nyse",
    showFurniture = true,
}: Props) {
    const canvasRef    = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [loaded, setLoaded] = useState(false);

    const animFrameRef    = useRef(0);
    const rafIdRef        = useRef(0);
    const lastAnimTimeRef = useRef(0);

    const MAX_AVATARS = mobile ? 12 : 30;
    const displayed   = presence.slice(0, MAX_AVATARS);

    useEffect(() => {
        preloadAllSprites().then(() => setLoaded(true)).catch(console.error);
    }, []);

    const draw = useCallback(
        (timestamp: number) => {
            if (!loaded) return;
            const canvas    = canvasRef.current;
            const container = containerRef.current;
            if (!canvas || !container) return;

            const dpr  = window.devicePixelRatio || 1;
            const rect = container.getBoundingClientRect();
            const w    = Math.round(rect.width);
            const h    = Math.round(rect.height);

            if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
                canvas.width        = w * dpr;
                canvas.height       = h * dpr;
                canvas.style.width  = `${w}px`;
                canvas.style.height = `${h}px`;
                const ctx2 = canvas.getContext("2d");
                if (ctx2) ctx2.imageSmoothingEnabled = false;
            }

            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            ctx.imageSmoothingEnabled = false;

            // Advance animation frame
            if (timestamp - lastAnimTimeRef.current > ANIM_INTERVAL) {
                animFrameRef.current++;
                lastAnimTimeRef.current = timestamp;
            }
            const animFrame = animFrameRef.current;

            ctx.save();
            ctx.scale(dpr, dpr);
            ctx.clearRect(0, 0, w, h);

            // ── 1. Floor ──────────────────────────────────────────────────────
            const floorScale = mobile ? TILE_SCALE - 1 : TILE_SCALE;
            const tileW = FLOOR_TILE_SIZE * floorScale;
            const tileH = FLOOR_TILE_SIZE * floorScale;

            if (floorStyle === "nyse") {
                // ── NYSE trading floor zones ──────────────────────────────────
                // nyse-floor-tiles.png: 4 cols × 1 row
                //   col 0: blonde maple wood  (center aisle)
                //   col 1: dark charcoal      (station pod areas)
                //   col 2: dark teal          (circular pit ring)
                //   col 3: gunmetal dark      (back ceiling zone)
                const nyseSheet = getNyseTileSheet();
                if (nyseSheet) {
                    const srcW = nyseSheet.naturalWidth  / 4;
                    const srcH = nyseSheet.naturalHeight; // single row

                    // Pit centre (ellipse-ish region for the circular post)
                    const pitCX = w * 0.50;
                    const pitCY = h * 0.35;
                    const pitRX = w * 0.18;
                    const pitRY = h * 0.22;

                    // Station side zones
                    const sideW = w * 0.22;

                    for (let x = 0; x < w; x += tileW) {
                        for (let y = 0; y < h; y += tileH) {
                            const cx = x + tileW / 2;
                            const cy = y + tileH / 2;
                            const ny = cy / h;

                            let col: number;
                            if (ny < 0.11) {
                                // Back ceiling / wall zone — very dark
                                col = 3;
                            } else if (cx < sideW || cx > w - sideW) {
                                // Side station zones — dark charcoal
                                col = 1;
                            } else {
                                // Check if inside the trading pit ellipse
                                const dx = (cx - pitCX) / pitRX;
                                const dy = (cy - pitCY) / pitRY;
                                if (dx * dx + dy * dy < 1.0) {
                                    // Circular pit area — teal
                                    col = 2;
                                } else {
                                    // Center aisle — blonde maple
                                    col = 0;
                                }
                            }

                            ctx.drawImage(nyseSheet, col * srcW, 0, srcW, srcH, x, y, tileW, tileH);
                        }
                    }
                }

            } else if (floorStyle === "classic") {
                // Original checker pattern with Room_Builder tileset
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

            } else if (floorStyle === "zones") {
                // ── Multi-zone WS floor (the premium layout) ─────────────────
                const wsSheet = getFurnitureSheet("tiles");
                if (wsSheet) {
                    // Zone boundaries (normalized Y)
                    const backWallEnd   = h * 0.13;   // dark marble
                    const frontZoneStart = h * 0.80;  // light oak
                    // Executive carpet: centre X band, mid-lower Y
                    const execX1 = w * 0.28;
                    const execX2 = w * 0.72;
                    const execY1 = h * 0.43;
                    const execY2 = h * 0.77;

                    for (let x = 0; x < w; x += tileW) {
                        for (let y = 0; y < h; y += tileH) {
                            const cx = x + tileW / 2;
                            const cy = y + tileH / 2;

                            let col: number, row: number;
                            if (cy < backWallEnd) {
                                // Back wall zone: dark marble + gold veins
                                col = 1; row = 0;
                            } else if (cy >= frontZoneStart) {
                                // Front utility zone: light oak
                                col = 1; row = 1;
                            } else if (cx > execX1 && cx < execX2 && cy > execY1 && cy < execY2) {
                                // Executive centre: teal carpet
                                col = 2; row = 1;
                            } else {
                                // Main trading floor: cream tile
                                col = 2; row = 0;
                            }

                            const srcW = wsSheet.naturalWidth  / 4;
                            const srcH = wsSheet.naturalHeight / 2;
                            ctx.drawImage(wsSheet, col * srcW, row * srcH, srcW, srcH, x, y, tileW, tileH);
                        }
                    }
                }

            } else {
                // Single named WS tile repeated across whole canvas
                const wsSheet = getFurnitureSheet("tiles");
                if (wsSheet) {
                    const coord = WS_TILE[floorStyle] ?? { col: 2, row: 0 };
                    drawTileRegion(ctx, wsSheet, coord.col, coord.row, 0, 0, w, h, tileW, tileH);
                }
            }

            // ── 1b. Atmospheric overlays ──────────────────────────────────────

            // NYSE: dark station side zones — subtle blue glow tint
            if (floorStyle === "nyse") {
                const sideW = w * 0.22;
                // Left station glow
                const lgGrad = ctx.createLinearGradient(0, 0, sideW, 0);
                lgGrad.addColorStop(0,   "rgba(10, 20, 40, 0.45)");
                lgGrad.addColorStop(1,   "rgba(10, 20, 40, 0.00)");
                ctx.fillStyle = lgGrad;
                ctx.fillRect(0, 0, sideW, h);
                // Right station glow
                const rgGrad = ctx.createLinearGradient(w - sideW, 0, w, 0);
                rgGrad.addColorStop(0,   "rgba(10, 20, 40, 0.00)");
                rgGrad.addColorStop(1,   "rgba(10, 20, 40, 0.45)");
                ctx.fillStyle = rgGrad;
                ctx.fillRect(w - sideW, 0, sideW, h);
            }

            // Back-wall shadow strip — defines ceiling zone
            {
                const wallH = h * (floorStyle === "nyse" ? 0.16 : 0.14);
                const wallGrad = ctx.createLinearGradient(0, 0, 0, wallH);
                wallGrad.addColorStop(0,   floorStyle === "nyse" ? "rgba(4, 8, 18, 0.85)" : "rgba(8, 6, 4, 0.55)");
                wallGrad.addColorStop(0.6, floorStyle === "nyse" ? "rgba(4, 8, 18, 0.30)" : "rgba(8, 6, 4, 0.18)");
                wallGrad.addColorStop(1,   "rgba(4, 8, 18, 0.00)");
                ctx.fillStyle = wallGrad;
                ctx.fillRect(0, 0, w, wallH);
            }

            // ── 2. Entities (furniture + characters) — Y-sorted ───────────────
            const spriteScale  = mobile ? 2 : 3;
            const spritePixelW = SPRITE_W * spriteScale;
            const spritePixelH = SPRITE_H * spriteScale;

            type CharEntity = {
                kind: "char";
                x: number; y: number;
                charName: CharacterName;
                facing: "up" | "down" | "left" | "right";
                isUser: boolean;
                name: string;
                seed: number;
            };
            type FurnEntity = {
                kind: "furniture";
                x: number; y: number;
                obj: FurnitureObject;
                drawW: number; drawH: number;
            };
            type Entity = CharEntity | FurnEntity;
            const entities: Entity[] = [];

            // ── Furniture ─────────────────────────────────────────────────────
            if (showFurniture) {
                for (const obj of FLOOR_FURNITURE) {
                    entities.push({
                        kind:  "furniture",
                        x:     obj.posX * w,
                        y:     obj.posY * h,
                        obj,
                        drawW: obj.drawW * tileW,
                        drawH: obj.drawH * tileH,
                    });
                }
            }

            // ── NPCs ──────────────────────────────────────────────────────────
            for (const npc of DEMO_NPC_TRADERS) {
                const margin = spritePixelW;
                const x = margin + npc.posX * (w - 2 * margin) - spritePixelW / 2;
                const y = margin / 2 + npc.posY * (h - margin - spritePixelH / 2) - spritePixelH / 2;
                entities.push({ kind: "char", x, y, charName: npc.charName, facing: npc.facing, isUser: false, name: npc.name, seed: 0 });
            }

            // ── Real users ────────────────────────────────────────────────────
            for (const entry of displayed) {
                const seed    = hashStr(`${entry.walletAddress}:${spawnSeed}`);
                const charName = resolveCharacterName(entry.avatarId, entry.walletAddress);
                // Constrain spawn to centre corridor — keep players off the desk banks
                const posX = 0.28 + seededRand(seed, 0) * 0.44;
                const posY = 0.20 + seededRand(seed, 1) * 0.55;

                const dirRoll = seededRand(seed, 2);
                let facing: "down" | "right" | "left" | "up" = "down";
                if (dirRoll > 0.8) facing = "right";
                else if (dirRoll > 0.6) facing = "left";

                const margin = spritePixelW;
                const x = margin + posX * (w - 2 * margin) - spritePixelW / 2;
                const y = margin / 2 + posY * (h - margin - spritePixelH / 2) - spritePixelH / 2;

                const displayName = (entry.displayName || entry.walletAddress.slice(0, 6)).slice(0, 8);
                entities.push({ kind: "char", x, y, charName, facing, isUser: true, name: displayName, seed });
            }

            // ── Y-sort (depth ordering) ───────────────────────────────────────
            entities.sort((a, b) => {
                const aBottom = a.kind === "furniture" ? a.y + a.drawH : a.y + spritePixelH;
                const bBottom = b.kind === "furniture" ? b.y + b.drawH : b.y + spritePixelH;
                return aBottom - bBottom;
            });

            // ── Draw ──────────────────────────────────────────────────────────
            for (const entity of entities) {
                if (entity.kind === "furniture") {
                    let img: HTMLImageElement | undefined;
                    let sx: number, sy: number, srcW: number, srcH: number;

                    if (entity.obj.directKey) {
                        // Standalone sprite — draw the whole image
                        img = getExternalSprite(entity.obj.directKey);
                        if (!img || !img.naturalWidth) continue;
                        sx = 0; sy = 0;
                        srcW = img.naturalWidth;
                        srcH = img.naturalHeight;
                    } else {
                        // Sheet sprite — calculate source rect with optional spanning
                        img = getFurnitureSheet(entity.obj.sheet!);
                        if (!img || !img.naturalWidth) continue;
                        const cols    = entity.obj.sheetCols ?? 1;
                        const rows    = entity.obj.sheetRows ?? 1;
                        const spanC   = entity.obj.spanCols  ?? 1;
                        const spanR   = entity.obj.spanRows  ?? 1;
                        const cellW   = img.naturalWidth  / cols;
                        const cellH   = img.naturalHeight / rows;
                        sx   = (entity.obj.col ?? 0) * cellW;
                        sy   = (entity.obj.row ?? 0) * cellH;
                        srcW = cellW * spanC;
                        srcH = cellH * spanR;
                    }

                    ctx.drawImage(img, sx, sy, srcW, srcH, entity.x, entity.y, entity.drawW, entity.drawH);
                    continue;
                }

                // ── Character ─────────────────────────────────────────────────
                const tickOffset = entity.seed % 6;
                const src   = getSpriteSource("idleAnim", entity.facing, animFrame + tickOffset);
                const sheet = getSpriteSheet(entity.charName, src.sheet);

                if (sheet) {
                    ctx.drawImage(sheet, src.sx, src.sy, src.sw, src.sh, entity.x, entity.y, spritePixelW, spritePixelH);
                }

                // Name label
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
                ctx.fillStyle = entity.isUser ? "#67e8f9" : "#D4D4D8";
                ctx.fillText(entity.name, labelX, labelY + (mobile ? 7 : 9));
            }

            // ── 3. Edge vignettes ─────────────────────────────────────────────
            const vigCol = floorStyle === "nyse" ? "4, 8, 20" : "10, 8, 5";

            const topGrad = ctx.createLinearGradient(0, 0, 0, h * 0.13);
            topGrad.addColorStop(0, `rgba(${vigCol}, 0.88)`);
            topGrad.addColorStop(1, `rgba(${vigCol}, 0)`);
            ctx.fillStyle = topGrad;
            ctx.fillRect(0, 0, w, h * 0.13);

            const botGrad = ctx.createLinearGradient(0, h * 0.85, 0, h);
            botGrad.addColorStop(0, `rgba(${vigCol}, 0)`);
            botGrad.addColorStop(1, `rgba(${vigCol}, 0.70)`);
            ctx.fillStyle = botGrad;
            ctx.fillRect(0, h * 0.85, w, h * 0.15);

            const lGrad = ctx.createLinearGradient(0, 0, w * 0.04, 0);
            lGrad.addColorStop(0, `rgba(${vigCol}, 0.65)`);
            lGrad.addColorStop(1, `rgba(${vigCol}, 0)`);
            ctx.fillStyle = lGrad;
            ctx.fillRect(0, 0, w * 0.04, h);

            const rGrad = ctx.createLinearGradient(w * 0.96, 0, w, 0);
            rGrad.addColorStop(0, `rgba(${vigCol}, 0)`);
            rGrad.addColorStop(1, `rgba(${vigCol}, 0.65)`);
            ctx.fillStyle = rGrad;
            ctx.fillRect(w * 0.96, 0, w * 0.04, h);

            ctx.restore();

            rafIdRef.current = requestAnimationFrame(draw);
        },
        [displayed, mobile, loaded, spawnSeed, floorStyle, showFurniture],
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
