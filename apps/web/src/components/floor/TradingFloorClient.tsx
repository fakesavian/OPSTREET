"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useWallet } from "@/components/WalletProvider";
import {
  floorJoin,
  floorLeave,
  fetchFloorPresence,
  fetchFloorStats,
  fetchFloorCallouts,
  fetchFloorChat,
  fetchFloorTicker,
  type FloorProfile,
} from "@/lib/api";
import type {
  FloorPresenceDTO,
  FloorCalloutDTO,
  FloorChatDTO,
  FloorTickerDTO,
  FloorStatsDTO,
} from "@opfun/shared";

import { TickerTape } from "./TickerTape";
import { AvatarCrowd } from "./AvatarCrowd";
import { CalloutFeed } from "./CalloutFeed";
import { ChartPanel } from "./ChartPanel";
import { NewsPanel } from "./NewsPanel";
import { ChatBox } from "./ChatBox";
import { JoinFloorModal } from "./JoinFloorModal";
import { FloorStats } from "./FloorStats";
import { MonitorPanel } from "./MonitorPanel";

// ── Polling intervals (ms) ────────────────────────────────────────────────
const PRESENCE_INTERVAL  = 5_000;
const CALLOUT_INTERVAL   = 3_000;
const CHAT_INTERVAL      = 2_000;
const TICKER_INTERVAL    = 30_000;
const STATS_INTERVAL     = 10_000;
const HEARTBEAT_INTERVAL = 30_000;

// ── Mobile tab type ───────────────────────────────────────────────────────
type MobileTab = "room" | "callouts" | "chat";

// ── TowerMonitor — scrolling stock-ticker display inside a TV frame ───────

interface TowerMonitorProps {
  ticker: FloorTickerDTO[];
  index: number;
  tokenOffset: number;
}

function TowerMonitor({ ticker, index, tokenOffset }: TowerMonitorProps) {
  const [displayIdx, setDisplayIdx] = useState((index + tokenOffset) % Math.max(ticker.length, 1));

  useEffect(() => {
    if (ticker.length === 0) return;
    // Stagger interval per monitor index so they cycle independently
    const delay = index * 1200;
    const id = setTimeout(() => {
      const interval = setInterval(() => {
        setDisplayIdx((prev) => (prev + 1) % ticker.length);
      }, 3500 + index * 400);
      return () => clearInterval(interval);
    }, delay);
    return () => clearTimeout(id);
  }, [ticker.length, index]);

  const item = ticker.length > 0 ? ticker[displayIdx % ticker.length] : null;
  const priceDelta = item?.priceDelta24h ?? "";
  const isPos = priceDelta.startsWith("+");

  return (
    <div
      className="flex-1 min-h-0 m-1.5 rounded-sm border border-ink bg-[var(--panel-cream)] overflow-hidden flex flex-col items-center justify-center gap-0.5 px-1"
      style={{
        boxShadow: "inset 0 0 8px rgba(17,17,17,0.05)",
      }}
    >
      {item ? (
        <>
          <span className="text-[7px] font-mono font-black text-ink leading-none truncate w-full text-center">
            ${item.ticker}
          </span>
          <span
            className={`text-[7px] font-mono font-bold leading-none ${isPos ? "text-opGreen" : "text-opRed"}`}
          >
            {priceDelta || "0.0%"}
          </span>
          <span className="text-[6px] font-mono text-[var(--text-muted)] leading-none">
            R:{item.riskScore ?? "—"}
          </span>
        </>
      ) : (
        <span className="text-[7px] text-[var(--text-muted)] font-mono">—</span>
      )}
    </div>
  );
}

// ── Tower column (3 monitor frames) ──────────────────────────────────────

interface TowerColumnProps {
  ticker: FloorTickerDTO[];
  side: "left" | "right";
}

function TowerColumn({ ticker, side }: TowerColumnProps) {
  return (
    <div
      className="flex w-20 shrink-0 flex-col py-2"
      style={{
        background:
          side === "left"
            ? "linear-gradient(90deg, #FFF7E8 0%, #FFFBEB 50%, #FFF7E8 100%)"
            : "linear-gradient(270deg, #FFF7E8 0%, #FFFBEB 50%, #FFF7E8 100%)",
        borderRight: side === "left" ? "1px solid #111111" : undefined,
        borderLeft:  side === "right" ? "1px solid #111111" : undefined,
      }}
    >
      {[0, 1, 2].map((i) => (
        <TowerMonitor key={i} ticker={ticker} index={i} tokenOffset={side === "right" ? 3 : 0} />
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export function TradingFloorClient() {
  const { wallet } = useWallet();
  const walletAddress = wallet?.address ?? null;

  const [profile, setProfile]         = useState<FloorProfile | null>(null);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [hasJoined, setHasJoined]     = useState(false);

  const [presence, setPresence]       = useState<FloorPresenceDTO[]>([]);
  const [callouts, setCallouts]       = useState<FloorCalloutDTO[]>([]);
  const [chat, setChat]               = useState<FloorChatDTO[]>([]);
  const [ticker, setTicker]           = useState<FloorTickerDTO[]>([]);
  const [stats, setStats]             = useState<FloorStatsDTO>({ activeUsers: 0, totalCallouts: 0, totalMessages: 0 });

  const [mobileTab, setMobileTab]     = useState<MobileTab>("room");
  const lastChatTs                    = useRef<string | undefined>(undefined);

  // ── Fetch helpers ──────────────────────────────────────────────────────

  const fetchPresence = useCallback(async () => {
    try { setPresence(await fetchFloorPresence()); } catch { /* ignore */ }
  }, []);

  const fetchCalloutData = useCallback(async () => {
    try { setCallouts(await fetchFloorCallouts(50, walletAddress ?? undefined)); } catch { /* ignore */ }
  }, [walletAddress]);

  const fetchChatData = useCallback(async () => {
    try {
      const newMsgs = await fetchFloorChat(lastChatTs.current);
      if (newMsgs.length > 0) {
        setChat((prev) => {
          if (!lastChatTs.current) return newMsgs;
          const existingIds = new Set(prev.map((m) => m.id));
          const fresh = newMsgs.filter((m) => !existingIds.has(m.id));
          return [...prev, ...fresh].slice(-200);
        });
        lastChatTs.current = newMsgs[newMsgs.length - 1]!.createdAt;
      }
    } catch { /* ignore */ }
  }, []);

  const fetchTickerData = useCallback(async () => {
    try { setTicker(await fetchFloorTicker()); } catch { /* ignore */ }
  }, []);

  const fetchStatsData = useCallback(async () => {
    try { setStats(await fetchFloorStats()); } catch { /* ignore */ }
  }, []);

  // ── Initial load ───────────────────────────────────────────────────────

  useEffect(() => {
    fetchPresence();
    fetchCalloutData();
    fetchChatData();
    fetchTickerData();
    fetchStatsData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Polling ────────────────────────────────────────────────────────────

  useEffect(() => {
    const intervals = [
      setInterval(fetchPresence, PRESENCE_INTERVAL),
      setInterval(fetchCalloutData, CALLOUT_INTERVAL),
      setInterval(fetchChatData, CHAT_INTERVAL),
      setInterval(fetchTickerData, TICKER_INTERVAL),
      setInterval(fetchStatsData, STATS_INTERVAL),
    ];
    return () => intervals.forEach(clearInterval);
  }, [fetchPresence, fetchCalloutData, fetchChatData, fetchTickerData, fetchStatsData]);

  // ── Heartbeat ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!walletAddress || !hasJoined) return;
    const id = setInterval(() => {
      floorJoin({ walletAddress }).catch(() => undefined);
    }, HEARTBEAT_INTERVAL);
    return () => clearInterval(id);
  }, [walletAddress, hasJoined]);

  // ── Leave on unmount ───────────────────────────────────────────────────

  useEffect(() => {
    return () => { if (walletAddress) floorLeave(walletAddress); };
  }, [walletAddress]);

  // ── Show join modal ────────────────────────────────────────────────────

  useEffect(() => {
    if (walletAddress && !hasJoined && !profile) setShowJoinModal(true);
  }, [walletAddress, hasJoined, profile]);

  // ── Join handler ───────────────────────────────────────────────────────

  const handleJoin = useCallback(
    async (displayName: string) => {
      if (!walletAddress) return;
      const p = await floorJoin({ walletAddress, displayName });
      setProfile(p);
      setHasJoined(true);
      setShowJoinModal(false);
      await fetchPresence();
    },
    [walletAddress, fetchPresence],
  );

  const latestCallout    = callouts[0] ?? null;
  const handleJoinClick  = useCallback(() => { if (walletAddress) setShowJoinModal(true); }, [walletAddress]);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ══════════════════════════════════════════════════════════════
          DESKTOP — full-viewport command center (≥ md)
         ══════════════════════════════════════════════════════════════ */}
      <div
        className="hidden md:flex h-[calc(100vh-57px)] w-full flex-row overflow-hidden"
        style={{
          background: "linear-gradient(180deg, #FFF7E8 0%, #FFFBEB 55%, #FFF7E8 100%)",
        }}
      >
        {/* ── Left TV tower ──────────────────────────────────────── */}
        <TowerColumn ticker={ticker} side="left" />

        {/* ── Center: monitor wall + crowd ────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

          {/* Monitor wall — top 52% */}
          <div className="flex flex-col overflow-hidden" style={{ height: "52%" }}>
            <TickerTape items={ticker} />

            <div className="flex min-h-0 flex-1 flex-row gap-2 overflow-hidden p-2">
              <MonitorPanel label="CALLOUTS" className="flex-[2] min-w-0">
                <CalloutFeed
                  callouts={callouts}
                  walletAddress={walletAddress}
                  ticker={ticker}
                  onCalloutPosted={fetchCalloutData}
                  onReacted={fetchCalloutData}
                  className="h-full overflow-hidden"
                />
              </MonitorPanel>

              <MonitorPanel
                label="CHART + TRADE"
                className="flex-[3] min-w-0"
              >
                <ChartPanel ticker={ticker} walletAddress={walletAddress} />
              </MonitorPanel>

              <MonitorPanel label="TROLLBOX" className="flex-[2] min-w-0">
                <ChatBox
                  messages={chat}
                  walletAddress={walletAddress}
                  muteUntil={profile?.muteUntil ?? null}
                  onMessageSent={fetchChatData}
                  className="h-full"
                />
              </MonitorPanel>

              <MonitorPanel label="NEWS" className="flex-[1] min-w-0">
                <NewsPanel />
              </MonitorPanel>
            </div>
          </div>

          {/* Stage platform edge */}
          <div className="h-[3px] shrink-0 bg-ink" />

          {/* Crowd area — bottom ~48% */}
          <div className="relative flex-1 overflow-hidden">
            <AvatarCrowd
              crowdOnly
              presence={presence}
              walletAddress={walletAddress}
              latestCallout={latestCallout}
              callouts={callouts}
              ticker={ticker}
              onJoinClick={handleJoinClick}
            />
            <div className="absolute bottom-2 left-3 z-10">
              <FloorStats stats={stats} />
            </div>
          </div>
        </div>

        {/* ── Right TV tower ──────────────────────────────────────── */}
        <TowerColumn ticker={ticker} side="right" />
      </div>

      {/* ══════════════════════════════════════════════════════════════
          MOBILE — tab-based card layout (< md)
         ══════════════════════════════════════════════════════════════ */}
      <div className="md:hidden bg-[var(--panel-cream)]">
        <TickerTape items={ticker} />
        <div className="px-4 pt-2 pb-1">
          <FloorStats stats={stats} />
        </div>
        <div className="flex gap-1 px-4 pb-2 pt-1">
          {(["room", "callouts", "chat"] as MobileTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setMobileTab(tab)}
              className={`flex-1 rounded-lg py-2 text-xs font-bold capitalize transition-colors ${
                mobileTab === tab
                  ? "bg-opYellow text-ink border-2 border-ink"
                  : "bg-[var(--cream)] text-[var(--text-muted)] border-2 border-ink hover:bg-opYellow/20"
              }`}
            >
              {tab === "room" ? "Room" : tab === "callouts" ? "Callouts" : "Chat"}
            </button>
          ))}
        </div>
        <div className="px-4 pb-24 bg-[var(--panel-cream)]">
          {mobileTab === "room" && (
            <AvatarCrowd
              presence={presence}
              walletAddress={walletAddress}
              latestCallout={latestCallout}
              callouts={callouts}
              ticker={ticker}
              onJoinClick={handleJoinClick}
              mobile
            />
          )}
          {mobileTab === "callouts" && (
            <CalloutFeed
              callouts={callouts}
              walletAddress={walletAddress}
              ticker={ticker}
              onCalloutPosted={fetchCalloutData}
              onReacted={fetchCalloutData}
            />
          )}
          {mobileTab === "chat" && (
            <ChatBox
              messages={chat}
              walletAddress={walletAddress}
              muteUntil={profile?.muteUntil ?? null}
              onMessageSent={fetchChatData}
            />
          )}
        </div>
      </div>

      {/* Join Floor Modal */}
      {showJoinModal && walletAddress && (
        <JoinFloorModal
          walletAddress={walletAddress}
          onJoin={handleJoin}
          onClose={() => setShowJoinModal(false)}
        />
      )}
    </div>
  );
}
