# Skill 08 — Trading Chart UX (TradingView Lightweight Charts)

## Purpose
Deliver a **real trading feel** chart:
candles/line toggle, pan/zoom, timeframes, crosshair, responsive resizing.

## Trigger
- “Chart must be fully functioning like a real crypto chart.”
- Token page redesign requires interactive chart.

## Inputs
- Existing token price data source (simulated OK)
- Current chart component location
- Desired timeframes (1H/4H/1D/1W etc.)

## Outputs
- Chart component using TradingView Lightweight Charts (or equivalent)
- Toggle candles/line
- Pan/zoom + timeframe switching
- Data adapter for simulated feeds

## Steps
1) **Install**
   - `pnpm --filter web add lightweight-charts`

2) **Create chart component**
   - `TokenChart.tsx`
   - Uses `createChart` on mount
   - Resizes via `ResizeObserver`
   - Cleans up on unmount

3) **Data adapter**
   - Normalize to `{ time, open, high, low, close }` for candles
   - `{ time, value }` for line

4) **Controls**
   - Timeframe pills (1H/4H/1D/1W)
   - Toggle: Candle / Line
   - Reset view button

5) **UX polish**
   - Crosshair on
   - Scroll/drag hints (“Drag to pan, scroll to zoom”)
   - “SIMULATED” label in corner if data is fake

6) **Verify**
   - Works on desktop and mobile
   - No reflow glitches inside panel frame

## Done criteria
- User can pan/zoom, switch timeframe, and switch candle/line.
- Chart resizes correctly when viewport changes.

## Common failure modes
- Chart reinitializes too often (should not on every render)
- ResizeObserver missing; chart gets clipped
- Time format wrong (seconds vs ms)

## Rollback plan
- Keep old chart behind a prop flag until new one stable.
