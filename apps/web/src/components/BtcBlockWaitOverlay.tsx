"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// OPNet testnet mempool explorer
const MEMPOOL_BASE = "https://mempool.opnet.org/testnet4/tx";

// ── Pixel art isometric cube (SVG) ──────────────────────────────────────────
function PixelCube({
  size = 36,
  highlight = false,
  pulse = false,
}: {
  size?: number;
  highlight?: boolean;
  pulse?: boolean;
}) {
  const w = size;
  const h = Math.round(size * 1.15);
  const half = w / 2;
  const top = Math.round(h * 0.3);
  const mid = Math.round(h * 0.55);
  const bot = h;

  const topFill = highlight ? "#FFD700" : "#C8980A";
  const leftFill = highlight ? "#CC9900" : "#9A7008";
  const rightFill = highlight ? "#A07000" : "#6B4E06";
  const stroke = "#111111";

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{
        imageRendering: "pixelated",
        animation: pulse ? "cubePulse 1.2s ease-in-out infinite" : undefined,
        filter: highlight ? "drop-shadow(0 0 4px #FFD70088)" : undefined,
      }}
    >
      {/* Top face */}
      <polygon
        points={`${half},0 ${w},${top} ${half},${mid} 0,${top}`}
        fill={topFill}
        stroke={stroke}
        strokeWidth="1.5"
      />
      {/* Left face */}
      <polygon
        points={`0,${top} ${half},${mid} ${half},${bot} 0,${bot - top}`}
        fill={leftFill}
        stroke={stroke}
        strokeWidth="1.5"
      />
      {/* Right face */}
      <polygon
        points={`${half},${mid} ${w},${top} ${w},${bot - top} ${half},${bot}`}
        fill={rightFill}
        stroke={stroke}
        strokeWidth="1.5"
      />
    </svg>
  );
}

// ── Timer ────────────────────────────────────────────────────────────────────
function useElapsed(running: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// ── Main overlay ──────────────────────────────────────────────────────────────
interface Props {
  txId: string;
  onDismiss?: () => void;
}

export function BtcBlockWaitOverlay({ txId, onDismiss }: Props) {
  const [minimized, setMinimized] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [pulseIdx, setPulseIdx] = useState(1);
  const elapsed = useElapsed(true);

  const panelRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);

  // Init position: bottom-right on desktop, bottom-center on mobile
  useEffect(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setPos({ x: Math.max(8, vw - 380), y: Math.max(8, vh - 320) });
  }, []);

  // Cycle pulse cube index every 800ms
  useEffect(() => {
    const id = setInterval(() => setPulseIdx((i) => (i + 1) % 3), 800);
    return () => clearInterval(id);
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (!panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    dragStart.current = { mx: e.clientX, my: e.clientY, px: rect.left, py: rect.top };
    e.preventDefault();
  }, []);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragStart.current) return;
      const dx = e.clientX - dragStart.current.mx;
      const dy = e.clientY - dragStart.current.my;
      const panel = panelRef.current;
      if (!panel) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const newX = Math.min(Math.max(0, dragStart.current.px + dx), vw - panel.offsetWidth);
      const newY = Math.min(Math.max(0, dragStart.current.py + dy), vh - panel.offsetHeight);
      setPos({ x: newX, y: newY });
    }
    function onUp() {
      dragStart.current = null;
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  function copyTx() {
    void navigator.clipboard.writeText(txId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const short = `${txId.slice(0, 10)}…${txId.slice(-8)}`;

  if (pos === null) return null;

  return (
    <>
      <style>{`
        @keyframes cubePulse {
          0%, 100% { transform: translateY(0); opacity: 1; }
          50%       { transform: translateY(-5px); opacity: 0.85; }
        }
      `}</style>

      <div
        ref={panelRef}
        className="fixed z-[9999] select-none"
        style={{ left: pos.x, top: pos.y, width: 340 }}
      >
        {/* ── Header (drag handle) ────────────────────────────────────── */}
        <div
          className="flex cursor-grab items-center justify-between rounded-t-[16px] border-[3px] border-b-0 border-ink bg-opYellow px-3 py-2 shadow-[4px_0px_0_#111,0px_-4px_0_#111]"
          onMouseDown={onMouseDown}
        >
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] font-black tracking-[0.2em] text-ink">
              ⛏ AWAITING BLOCK
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMinimized((m) => !m)}
              className="flex h-5 w-5 items-center justify-center rounded-[6px] border-[2px] border-ink bg-[#fff7e8] text-[10px] font-black text-ink hover:bg-ink hover:text-opYellow transition-colors"
              title={minimized ? "Expand" : "Minimize"}
            >
              {minimized ? "▲" : "▼"}
            </button>
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="flex h-5 w-5 items-center justify-center rounded-[6px] border-[2px] border-ink bg-[#fff7e8] text-[10px] font-black text-ink hover:bg-opRed hover:text-white transition-colors"
                title="Dismiss"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* ── Body ────────────────────────────────────────────────────── */}
        {!minimized && (
          <div className="rounded-b-[16px] border-[3px] border-ink bg-[#fff7e8] px-4 pb-4 pt-3 shadow-[4px_4px_0_#111]">
            {/* Pixel cubes — mempool blocks */}
            <div className="mb-3 flex items-end justify-center gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex flex-col items-center gap-0.5">
                  <PixelCube
                    size={i === 1 ? 40 : 30}
                    highlight={i === 1}
                    pulse={pulseIdx === i}
                  />
                  <span className="font-mono text-[8px] font-black text-ink/50">
                    {i === 1 ? "PENDING" : i === 0 ? "PREV" : "NEXT"}
                  </span>
                </div>
              ))}
            </div>

            {/* TxId */}
            <div className="mb-2 rounded-[10px] border-[2px] border-ink bg-ink px-3 py-2">
              <div className="mb-1 font-mono text-[9px] font-bold uppercase tracking-widest text-opYellow/70">
                Transaction
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] font-black text-opYellow">{short}</span>
                <button
                  type="button"
                  onClick={copyTx}
                  className="rounded-[6px] border border-opYellow/40 px-2 py-0.5 font-mono text-[9px] font-black text-opYellow hover:border-opYellow transition-colors"
                >
                  {copied ? "✓ copied" : "copy"}
                </button>
              </div>
              <a
                href={`${MEMPOOL_BASE}/${txId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block font-mono text-[9px] text-opYellow/50 hover:text-opYellow transition-colors"
              >
                View on mempool.opnet.org ↗
              </a>
            </div>

            {/* Timer + status */}
            <div className="flex items-center justify-between">
              <div>
                <div className="font-mono text-[9px] font-bold uppercase tracking-widest text-ink/50">
                  Elapsed
                </div>
                <div className="font-mono text-[22px] font-black leading-none text-ink">
                  {elapsed}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-[9px] font-bold uppercase tracking-widest text-ink/50">
                  Avg block time
                </div>
                <div className="font-mono text-[13px] font-black text-ink">~10 min</div>
              </div>
            </div>

            <p className="mt-2 font-mono text-[10px] font-bold leading-relaxed text-ink/60">
              Your transaction is in the mempool.
              <br />
              Waiting for 1 Bitcoin block confirmation.
            </p>
          </div>
        )}

        {/* Minimized pill shows timer */}
        {minimized && (
          <div className="rounded-b-[10px] border-[3px] border-t-0 border-ink bg-[#fff7e8] px-3 py-1.5 shadow-[4px_4px_0_#111]">
            <span className="font-mono text-[11px] font-black text-ink">{elapsed}</span>
            <span className="ml-2 font-mono text-[9px] text-ink/50">{short}</span>
          </div>
        )}
      </div>
    </>
  );
}
