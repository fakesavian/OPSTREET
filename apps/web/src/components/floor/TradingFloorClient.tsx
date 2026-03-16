"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import {
  floorJoin,
  floorLeave,
  fetchFloorCallouts,
  fetchFloorChat,
  fetchFloorPresence,
  fetchFloorStats,
  fetchFloorTicker,
  fetchPlayerMe,
  type FloorProfile,
} from "@/lib/api";
import type {
  FloorCalloutDTO,
  FloorChatDTO,
  FloorPresenceDTO,
  FloorStatsDTO,
  FloorTickerDTO,
} from "@opfun/shared";
import { AvatarCrowd } from "./AvatarCrowd";
import { AvatarFigure } from "./AvatarFigure";
import { CalloutFeed } from "./CalloutFeed";
import { ChartPanel } from "./ChartPanel";
import { ChatBox } from "./ChatBox";
import { FloorStats } from "./FloorStats";
import { FloatingFloorPanel } from "./FloatingFloorPanel";
import { JoinFloorModal } from "./JoinFloorModal";
import { TickerTape } from "./TickerTape";

const PRESENCE_INTERVAL = 5_000;
const CALLOUT_INTERVAL = 3_000;
const CHAT_INTERVAL = 2_000;
const TICKER_INTERVAL = 30_000;
const STATS_INTERVAL = 10_000;
const HEARTBEAT_INTERVAL = 30_000;

const DESKTOP_BACKGROUND_SRC = "/opstreet/floor/trading-floor-backdrop-square-v1.png";

type MobilePanelKey = "chart" | "callouts" | "chat";

function hashStr(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function seededRand(seed: number, offset: number): number {
  const value = Math.sin(seed + offset) * 10_000;
  return value - Math.floor(value);
}

function getDesktopCalloutFrequency(callouts: FloorCalloutDTO[]): "low" | "medium" | "high" {
  const recentCallouts = callouts.filter((callout) => Date.now() - new Date(callout.createdAt).getTime() < 60_000);
  if (recentCallouts.length > 8) return "high";
  if (recentCallouts.length > 3) return "medium";
  return "low";
}

export function TradingFloorClient() {
  const { wallet } = useWallet();
  const walletAddress = wallet?.address ?? null;

  const [profile, setProfile] = useState<FloorProfile | null>(null);
  const [savedDisplayName, setSavedDisplayName] = useState("");
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);

  const [presence, setPresence] = useState<FloorPresenceDTO[]>([]);
  const [callouts, setCallouts] = useState<FloorCalloutDTO[]>([]);
  const [chat, setChat] = useState<FloorChatDTO[]>([]);
  const [ticker, setTicker] = useState<FloorTickerDTO[]>([]);
  const [stats, setStats] = useState<FloorStatsDTO>({
    activeUsers: 0,
    totalCallouts: 0,
    totalMessages: 0,
  });
  const [chatVisibleSince, setChatVisibleSince] = useState<string | null>(null);
  const [openMobilePanels, setOpenMobilePanels] = useState<Record<MobilePanelKey, boolean>>({
    chart: false,
    callouts: false,
    chat: false,
  });

  const lastChatTs = useRef<string | undefined>(undefined);
  const leftDockRef = useRef<HTMLDivElement>(null);
  const rightDockRef = useRef<HTMLDivElement>(null);

  const fetchPresence = useCallback(async () => {
    try {
      setPresence(await fetchFloorPresence());
    } catch {
      // ignore
    }
  }, []);

  const fetchCalloutData = useCallback(async () => {
    try {
      setCallouts(await fetchFloorCallouts(50, walletAddress ?? undefined));
    } catch {
      // ignore
    }
  }, [walletAddress]);

  const fetchChatData = useCallback(async () => {
    if (!chatVisibleSince) return;
    try {
      const newMessages = await fetchFloorChat(lastChatTs.current ?? chatVisibleSince);
      if (newMessages.length > 0) {
        setChat((previous) => {
          const existingIds = new Set(previous.map((message) => message.id));
          const fresh = newMessages.filter((message) => !existingIds.has(message.id));
          return [...previous, ...fresh].slice(-200);
        });
        lastChatTs.current = newMessages[newMessages.length - 1]!.createdAt;
      }
    } catch {
      // ignore
    }
  }, [chatVisibleSince]);

  const fetchTickerData = useCallback(async () => {
    try {
      setTicker(await fetchFloorTicker());
    } catch {
      // ignore
    }
  }, []);

  const fetchStatsData = useCallback(async () => {
    try {
      setStats(await fetchFloorStats());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!walletAddress) {
      setProfile(null);
      setSavedDisplayName("");
      setHasJoined(false);
      setShowJoinModal(false);
      setChat([]);
      setChatVisibleSince(null);
      lastChatTs.current = undefined;
      return;
    }

    let active = true;
    fetchPlayerMe()
      .then((me) => {
        if (active) setSavedDisplayName(me.displayName.trim());
      })
      .catch(() => {
        if (active) setSavedDisplayName("");
      });
    return () => {
      active = false;
    };
  }, [walletAddress]);

  useEffect(() => {
    fetchPresence();
    fetchCalloutData();
    fetchTickerData();
    fetchStatsData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const intervals = [
      setInterval(fetchPresence, PRESENCE_INTERVAL),
      setInterval(fetchCalloutData, CALLOUT_INTERVAL),
      setInterval(fetchTickerData, TICKER_INTERVAL),
      setInterval(fetchStatsData, STATS_INTERVAL),
    ];
    return () => intervals.forEach(clearInterval);
  }, [fetchPresence, fetchCalloutData, fetchTickerData, fetchStatsData]);

  useEffect(() => {
    if (!chatVisibleSince) return;
    void fetchChatData();
    const intervalId = setInterval(fetchChatData, CHAT_INTERVAL);
    return () => clearInterval(intervalId);
  }, [chatVisibleSince, fetchChatData]);

  useEffect(() => {
    if (!walletAddress || !hasJoined) return;
    const intervalId = setInterval(() => {
      floorJoin({ walletAddress }).catch(() => undefined);
    }, HEARTBEAT_INTERVAL);
    return () => clearInterval(intervalId);
  }, [walletAddress, hasJoined]);

  useEffect(() => {
    return () => {
      if (walletAddress) floorLeave(walletAddress);
    };
  }, [walletAddress]);

  useEffect(() => {
    if (walletAddress && !hasJoined && !profile) {
      setShowJoinModal(true);
    }
  }, [walletAddress, hasJoined, profile]);

  const handleJoin = useCallback(
    async (displayName: string) => {
      if (!walletAddress) return;
      const joinedAt = new Date().toISOString();
      const nextProfile = await floorJoin({ walletAddress, displayName });
      setProfile(nextProfile);
      setHasJoined(true);
      setShowJoinModal(false);
      setSavedDisplayName(nextProfile.displayName);
      setChat([]);
      setChatVisibleSince(joinedAt);
      lastChatTs.current = joinedAt;
      await fetchPresence();
    },
    [walletAddress, fetchPresence],
  );

  const handleJoinClick = useCallback(() => {
    if (walletAddress) setShowJoinModal(true);
  }, [walletAddress]);

  const latestCallout = callouts[0] ?? null;
  const desktopParticipants = presence.slice(0, 30);
  const desktopOverflow = Math.max(0, presence.length - desktopParticipants.length);
  const desktopCalloutFrequency = getDesktopCalloutFrequency(callouts);

  return (
    <div className="bg-[linear-gradient(180deg,#fff7e8_0%,#fffbeb_55%,#fff7e8_100%)]">
      <div className="hidden md:block">
        <div
          className="grid h-[calc(100vh-57px)] gap-4 overflow-hidden p-4 lg:p-5"
          style={{ gridTemplateColumns: "clamp(280px,24vw,400px) minmax(0,1fr) clamp(280px,24vw,400px)" }}
        >
          <div ref={leftDockRef} className="relative min-h-0 overflow-hidden rounded-[28px] border-[3px] border-ink bg-[rgba(255,247,232,0.72)]">
            <FloatingFloorPanel
              title="Chart"
              containerRef={leftDockRef}
              initialRect={{ x: 10, y: 10, width: 340, height: 440 }}
              minWidth={250}
              minHeight={280}
            >
              <div className="min-h-0 flex-1">
                <ChartPanel ticker={ticker} walletAddress={walletAddress} />
              </div>
            </FloatingFloorPanel>
          </div>

          <div className="flex min-w-0 items-center justify-center overflow-hidden">
            <div
              className="relative aspect-square overflow-hidden rounded-[34px] border-[3px] border-ink bg-[#FFF7E8] shadow-[8px_8px_0_#111]"
              style={{ width: "min(100%, calc(100vh - 132px))" }}
            >
              <img
                src={DESKTOP_BACKGROUND_SRC}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,247,232,0.08)_0%,rgba(255,247,232,0)_22%,rgba(17,17,17,0.08)_100%)]" />

              <div className="absolute left-[4%] right-[4%] top-[3%] z-10 overflow-hidden rounded-xl border-[3px] border-ink shadow-[4px_4px_0_rgba(17,17,17,0.28)]">
                <TickerTape items={ticker} />
              </div>

              <div className="absolute left-[4.5%] bottom-[5.5%] z-10">
                <FloorStats stats={stats} />
              </div>

              <div className="absolute inset-x-[8%] bottom-[4.5%] top-[16%] z-10 overflow-hidden">
                {desktopParticipants.length === 0 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
                    <p className="rounded-full bg-black/65 px-4 py-2 text-sm font-semibold text-[var(--panel-cream)] shadow-lg">
                      The floor is quiet...
                    </p>
                    {!walletAddress && (
                      <p className="text-xs font-semibold text-black/70">Connect your wallet to join.</p>
                    )}
                    {walletAddress && (
                      <button onClick={handleJoinClick} className="btn-primary px-4 py-2 text-xs">
                        Enter the Floor
                      </button>
                    )}
                  </div>
                )}

                {desktopParticipants.map((entry) => {
                  const seed = hashStr(entry.walletAddress);
                  const posX = 0.12 + seededRand(seed, 0) * 0.96;
                  const posY = 0.14 + seededRand(seed, 1) * 0.86;

                  return (
                    <AvatarFigure
                      key={entry.walletAddress}
                      entry={entry}
                      latestCallout={latestCallout}
                      size="md"
                      posX={posX}
                      posY={posY}
                      calloutFrequency={desktopCalloutFrequency}
                    />
                  );
                })}

                {desktopOverflow > 0 && (
                  <div className="absolute bottom-2 right-2 rounded-full border border-amber-900/60 bg-amber-950/85 px-2 py-0.5 text-[10px] font-mono text-amber-200">
                    +{desktopOverflow} more
                  </div>
                )}
              </div>
            </div>
          </div>

          <div ref={rightDockRef} className="relative min-h-0 overflow-hidden rounded-[28px] border-[3px] border-ink bg-[rgba(255,247,232,0.72)]">
            <FloatingFloorPanel
              title="Alpha Callouts"
              containerRef={rightDockRef}
              initialRect={{ x: 10, y: 10, width: 340, height: 310 }}
              minWidth={250}
              minHeight={240}
            >
              <CalloutFeed
                callouts={callouts}
                walletAddress={walletAddress}
                ticker={ticker}
                onCalloutPosted={fetchCalloutData}
                onReacted={fetchCalloutData}
                className="h-full"
              />
            </FloatingFloorPanel>

            <FloatingFloorPanel
              title="Trollbox"
              containerRef={rightDockRef}
              initialRect={{ x: 10, y: 332, width: 340, height: 340 }}
              minWidth={250}
              minHeight={240}
            >
              <ChatBox
                messages={chat}
                walletAddress={walletAddress}
                muteUntil={profile?.muteUntil ?? null}
                onMessageSent={fetchChatData}
                className="h-full"
              />
            </FloatingFloorPanel>
          </div>
        </div>
      </div>

      {/* ── Mobile layout ─────────────────────────────────────── */}
      <div className="pb-28 md:hidden">
        <TickerTape items={ticker} />

        {/* Floor */}
        <div className="px-4 pt-3">
          <div className="overflow-hidden rounded-[28px] border-[3px] border-ink bg-[var(--panel-cream)] shadow-[6px_6px_0_#111]">
            <AvatarCrowd
              presence={presence}
              walletAddress={walletAddress}
              latestCallout={latestCallout}
              callouts={callouts}
              ticker={ticker}
              onJoinClick={handleJoinClick}
              mobile
            />
          </div>
        </div>

        <div className="px-4 pt-3">
          <FloorStats stats={stats} />
        </div>

        {/* Chart accordion */}
        <div className="px-4 pt-3">
          <button
            type="button"
            onClick={() => setOpenMobilePanels((c) => ({ ...c, chart: !c.chart }))}
            className="flex w-full items-center justify-between rounded-[20px] border-[3px] border-ink bg-opYellow px-4 py-3 shadow-[4px_4px_0_#111] transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0_#111]"
          >
            <span className="flex items-center gap-2 text-sm font-black text-ink">
              <span aria-hidden>📈</span> Chart
            </span>
            <span
              className="text-xs font-black text-ink transition-transform duration-200"
              style={{ display: "inline-block", transform: openMobilePanels.chart ? "rotate(180deg)" : "rotate(0deg)" }}
            >
              ▼
            </span>
          </button>
          {openMobilePanels.chart && (
            <div className="mt-2 overflow-hidden rounded-[20px] border-[3px] border-ink bg-[var(--panel-cream)] shadow-[4px_4px_0_#111]">
              <ChartPanel ticker={ticker} walletAddress={walletAddress} />
            </div>
          )}
        </div>

        {/* Alpha Callouts accordion */}
        <div className="px-4 pt-3">
          <button
            type="button"
            onClick={() => setOpenMobilePanels((c) => ({ ...c, callouts: !c.callouts }))}
            className="flex w-full items-center justify-between rounded-[20px] border-[3px] border-ink bg-opYellow px-4 py-3 shadow-[4px_4px_0_#111] transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0_#111]"
          >
            <span className="flex items-center gap-2 text-sm font-black text-ink">
              <span aria-hidden>📡</span> Alpha Callouts
            </span>
            <span
              className="text-xs font-black text-ink transition-transform duration-200"
              style={{ display: "inline-block", transform: openMobilePanels.callouts ? "rotate(180deg)" : "rotate(0deg)" }}
            >
              ▼
            </span>
          </button>
          {openMobilePanels.callouts && (
            <div className="mt-2 overflow-hidden rounded-[20px] border-[3px] border-ink bg-[var(--panel-cream)] shadow-[4px_4px_0_#111]" style={{ height: 400 }}>
              <CalloutFeed
                callouts={callouts}
                walletAddress={walletAddress}
                ticker={ticker}
                onCalloutPosted={fetchCalloutData}
                onReacted={fetchCalloutData}
                className="h-full"
              />
            </div>
          )}
        </div>

        {/* Trollbox accordion */}
        <div className="px-4 pt-3">
          <button
            type="button"
            onClick={() => setOpenMobilePanels((c) => ({ ...c, chat: !c.chat }))}
            className="flex w-full items-center justify-between rounded-[20px] border-[3px] border-ink bg-opYellow px-4 py-3 shadow-[4px_4px_0_#111] transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0_#111]"
          >
            <span className="flex items-center gap-2 text-sm font-black text-ink">
              <span aria-hidden>💬</span> Trollbox
            </span>
            <span
              className="text-xs font-black text-ink transition-transform duration-200"
              style={{ display: "inline-block", transform: openMobilePanels.chat ? "rotate(180deg)" : "rotate(0deg)" }}
            >
              ▼
            </span>
          </button>
          {openMobilePanels.chat && (
            <div className="mt-2 overflow-hidden rounded-[20px] border-[3px] border-ink bg-[var(--panel-cream)] shadow-[4px_4px_0_#111]" style={{ height: 400 }}>
              <ChatBox
                messages={chat}
                walletAddress={walletAddress}
                muteUntil={profile?.muteUntil ?? null}
                onMessageSent={fetchChatData}
                className="h-full"
              />
            </div>
          )}
        </div>
      </div>

      {showJoinModal && walletAddress && (
        <JoinFloorModal
          walletAddress={walletAddress}
          initialDisplayName={savedDisplayName || profile?.displayName || walletAddress.slice(0, 8)}
          onJoin={handleJoin}
          onClose={() => setShowJoinModal(false)}
        />
      )}
    </div>
  );
}
