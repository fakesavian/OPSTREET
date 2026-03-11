/**
 * OPSTREET Trading Floor — NYSE-style Layout
 *
 * Inspired by the New York Stock Exchange trading floor:
 *   - Circular GTS trading post as the central hero
 *   - Dense monitor station pods flanking left + right
 *   - Wide monitor banks along far left + right walls
 *   - Light maple wood center aisle (clear walking corridor)
 *   - Dark charcoal floor under station pods
 *   - NYSE overhead screens + signage at back wall
 *
 * ── nyse-elements.png  (4 cols × 3 rows) ─────────────────────────────────
 *  (0,0)–(1,1)  Circular trading ring  [2×2 span]
 *  (2,0)        NYSE overhead screen (black + barcode logo)
 *  (3,0)        Bar stool (top-down, white seat)
 *  (2,1)–(3,1)  L-shaped monitor arc pod  [2×1 span]
 *  (3,1)        Monitor + keyboard array (right side of pod)
 *  (0,2)        NYSE sign panel (black + white text)
 *  (1,2)        Ticker LED board (black + orange)
 *  (2,2)        Overhead spotlight
 *  (3,2)        US flag on pole
 *
 * ── nyse-monitor-pod.png   — single horseshoe monitor station (directKey)
 * ── nyse-monitor-bank.png  — 5-screen flat monitor bank (directKey)
 *
 * ── Layout Zones ──────────────────────────────────────────────────────────
 *  Back wall:     y  0.00–0.10  NYSE screens + overhead elements
 *  Side stations: x  0.00–0.20 and 0.80–1.00  (dark charcoal floor)
 *  Center pit:    x  0.35–0.65, y 0.15–0.55   (teal floor, hero object)
 *  Center aisle:  x  0.20–0.80  (blonde maple wood floor)
 *  Front area:    y  0.75–1.00  (seating + small props)
 */

export type FurnitureSheet = "desk" | "props" | "large" | "nyse-elements";

export interface FurnitureObject {
    id: string;
    sheet?: FurnitureSheet;
    col?: number;
    row?: number;
    sheetCols?: number;
    sheetRows?: number;
    /** Span multiple cells horizontally */
    spanCols?: number;
    /** Span multiple cells vertically */
    spanRows?: number;
    /** Full standalone sprite — ignores sheet/col/row */
    directKey?: string;
    posX: number;
    posY: number;
    /** drawW × 48 px at desktop scale */
    drawW: number;
    drawH: number;
}

// ── nyse-elements helpers ────────────────────────────────────────────────────
const NY = { sheetCols: 4, sheetRows: 3, sheet: "nyse-elements" as const };

function nyseScreen(id: string, posX: number, posY: number, dw = 3.5, dh = 2): FurnitureObject {
    return { id, ...NY, col: 2, row: 0, posX, posY, drawW: dw, drawH: dh };
}

function nyseTicker(id: string, posX: number, posY: number): FurnitureObject {
    return { id, ...NY, col: 1, row: 2, posX, posY, drawW: 3.5, drawH: 1.5 };
}

function nyseSign(id: string, posX: number, posY: number): FurnitureObject {
    return { id, ...NY, col: 0, row: 2, posX, posY, drawW: 2.5, drawH: 1.5 };
}

function nyseFlag(id: string, posX: number, posY: number): FurnitureObject {
    return { id, ...NY, col: 3, row: 2, posX, posY, drawW: 1.5, drawH: 2 };
}

function nyseStool(id: string, posX: number, posY: number): FurnitureObject {
    return { id, ...NY, col: 3, row: 0, posX, posY, drawW: 1.5, drawH: 1.5 };
}

function nysePod(id: string, posX: number, posY: number, dw = 3.5, dh = 2): FurnitureObject {
    // L-shaped monitor arc pod — spans 2×1 in the sheet
    return { id, ...NY, col: 2, row: 1, spanCols: 2, spanRows: 1, posX, posY, drawW: dw, drawH: dh };
}

// ── PixelFloorCanvas.tsx draws these in Y-sorted order ───────────────────────

export const FLOOR_FURNITURE: FurnitureObject[] = [

    // ══════════════════════════════════════════════════════════════════════════
    // BACK WALL  (posY 0.00–0.10)
    // Dark ceiling zone — NYSE overhead screens dominate
    // ══════════════════════════════════════════════════════════════════════════

    // Four NYSE overhead screens spanning the full top width
    nyseScreen("nyse-screen-1", 0.01, 0.00, 3.5, 2.2),
    nyseScreen("nyse-screen-2", 0.25, 0.00, 3.5, 2.2),
    nyseScreen("nyse-screen-3", 0.50, 0.00, 3.5, 2.2),
    nyseScreen("nyse-screen-4", 0.74, 0.00, 3.5, 2.2),

    // Ticker board — full-width scrolling data strip
    nyseTicker("ticker-main", 0.00, 0.10),
    nyseTicker("ticker-main-2", 0.36, 0.10),
    nyseTicker("ticker-main-3", 0.70, 0.10),

    // ══════════════════════════════════════════════════════════════════════════
    // CIRCULAR TRADING PIT  (centre hero, posX≈0.32, posY≈0.15)
    // The GTS trading post — the whole scene frames around this
    // ══════════════════════════════════════════════════════════════════════════

    // The circular ring — spans 2×2 cells in nyse-elements sheet
    {
        id: "trading-pit",
        ...NY, col: 0, row: 0, spanCols: 2, spanRows: 2,
        posX: 0.28, posY: 0.12,
        drawW: 8, drawH: 7,
    },

    // Horseshoe monitor stations around the pit (from standalone sprite)
    {
        id: "monitor-pod-pit-top",
        directKey: "nyse-monitor-pod",
        posX: 0.33, posY: 0.12,
        drawW: 5, drawH: 3.5,
    },

    // ══════════════════════════════════════════════════════════════════════════
    // LEFT STATION PODS  (posX 0.00–0.22)
    // Dense monitor banks — the flanking trader stations
    // ══════════════════════════════════════════════════════════════════════════

    // Left wall monitor bank — full 5-screen array
    {
        id: "monitor-bank-l1",
        directKey: "nyse-monitor-bank",
        posX: 0.00, posY: 0.15,
        drawW: 5, drawH: 3,
    },
    {
        id: "monitor-bank-l2",
        directKey: "nyse-monitor-bank",
        posX: 0.00, posY: 0.42,
        drawW: 5, drawH: 3,
    },
    {
        id: "monitor-bank-l3",
        directKey: "nyse-monitor-bank",
        posX: 0.00, posY: 0.68,
        drawW: 5, drawH: 3,
    },

    // L-shaped arc pods along left aisle edge
    nysePod("pod-l1", 0.00, 0.18, 4, 2.5),
    nysePod("pod-l2", 0.00, 0.40, 4, 2.5),
    nysePod("pod-l3", 0.00, 0.62, 4, 2.5),

    // Stools for left station traders
    nyseStool("stool-l1", 0.16, 0.23),
    nyseStool("stool-l2", 0.16, 0.45),
    nyseStool("stool-l3", 0.16, 0.67),

    // NYSE signs on left pods
    nyseSign("sign-l1", 0.01, 0.17),
    nyseSign("sign-l2", 0.01, 0.64),

    // ══════════════════════════════════════════════════════════════════════════
    // RIGHT STATION PODS  (posX 0.78–1.00)
    // Mirror of left — creates the corridor symmetry
    // ══════════════════════════════════════════════════════════════════════════

    {
        id: "monitor-bank-r1",
        directKey: "nyse-monitor-bank",
        posX: 0.74, posY: 0.15,
        drawW: 5, drawH: 3,
    },
    {
        id: "monitor-bank-r2",
        directKey: "nyse-monitor-bank",
        posX: 0.74, posY: 0.42,
        drawW: 5, drawH: 3,
    },
    {
        id: "monitor-bank-r3",
        directKey: "nyse-monitor-bank",
        posX: 0.74, posY: 0.68,
        drawW: 5, drawH: 3,
    },

    nysePod("pod-r1", 0.76, 0.18, 4, 2.5),
    nysePod("pod-r2", 0.76, 0.40, 4, 2.5),
    nysePod("pod-r3", 0.76, 0.62, 4, 2.5),

    nyseStool("stool-r1", 0.76, 0.23),
    nyseStool("stool-r2", 0.76, 0.45),
    nyseStool("stool-r3", 0.76, 0.67),

    nyseSign("sign-r1", 0.88, 0.17),
    nyseSign("sign-r2", 0.88, 0.64),

    // ══════════════════════════════════════════════════════════════════════════
    // CENTER AISLE DRESSING  (posX 0.20–0.80)
    // The open blonde-wood corridor — light dressing, mostly walkable
    // ══════════════════════════════════════════════════════════════════════════

    // American flags flanking the pit entrance
    nyseFlag("flag-l", 0.24, 0.20),
    nyseFlag("flag-r", 0.70, 0.20),

    // Ticker displays mid-aisle (sides of pit, facing out)
    nyseTicker("ticker-pit-l", 0.20, 0.38),
    nyseTicker("ticker-pit-r", 0.60, 0.38),

    // ══════════════════════════════════════════════════════════════════════════
    // FRONT AREA  (posY 0.75–0.95)
    // Stools, small stations, front-of-floor dressing
    // ══════════════════════════════════════════════════════════════════════════

    // Front monitor bank left
    {
        id: "monitor-bank-fl",
        directKey: "nyse-monitor-bank",
        posX: 0.00, posY: 0.86,
        drawW: 4.5, drawH: 2.5,
    },
    // Front monitor bank right
    {
        id: "monitor-bank-fr",
        directKey: "nyse-monitor-bank",
        posX: 0.75, posY: 0.86,
        drawW: 4.5, drawH: 2.5,
    },

    // Center front — a small standalone station pod (corridor focal point)
    {
        id: "monitor-pod-front",
        directKey: "nyse-monitor-pod",
        posX: 0.36, posY: 0.78,
        drawW: 4, drawH: 3,
    },

    // Front row stools scattered
    nyseStool("stool-f1", 0.27, 0.82),
    nyseStool("stool-f2", 0.66, 0.82),
    nyseStool("stool-f3", 0.46, 0.88),
];
