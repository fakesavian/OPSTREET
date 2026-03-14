"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FloorCalloutDTO, FloorChatDTO, FloorTickerDTO } from "@opfun/shared";
import type { ClanDTO } from "@/lib/api";
import { ChatBox } from "./ChatBox";
import { CalloutFeed } from "./CalloutFeed";

type SocialTab = "chat" | "callouts" | "clan";

interface Props {
  sceneSize: number;
  chat: FloorChatDTO[];
  callouts: FloorCalloutDTO[];
  ticker: FloorTickerDTO[];
  walletAddress: string | null;
  muteUntil: string | null;
  clan: ClanDTO | null;
  onMessageSent: () => void;
  onCalloutPosted: () => void;
  onReacted: () => void;
  onSelectCallout: (callout: FloorCalloutDTO) => void;
}

interface PanelState {
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  initialized: boolean;
}

type InteractionState =
  | null
  | {
      type: "drag" | "resize";
      startX: number;
      startY: number;
      panel: PanelState;
    };

const MIN_WIDTH = 292;
const MIN_HEIGHT = 260;

export function FloorSocialPanel({
  sceneSize,
  chat,
  callouts,
  ticker,
  walletAddress,
  muteUntil,
  clan,
  onMessageSent,
  onCalloutPosted,
  onReacted,
  onSelectCallout,
}: Props) {
  const [activeTab, setActiveTab] = useState<SocialTab>("chat");
  const [interaction, setInteraction] = useState<InteractionState>(null);
  const [panel, setPanel] = useState<PanelState>({
    x: 0,
    y: 0,
    width: MIN_WIDTH,
    height: 360,
    minimized: false,
    initialized: false,
  });
  const panelRef = useRef(panel);

  const availableTabs = useMemo<SocialTab[]>(
    () => (clan ? ["chat", "callouts", "clan"] : ["chat", "callouts"]),
    [clan],
  );

  useEffect(() => {
    if (!availableTabs.includes(activeTab)) setActiveTab("chat");
  }, [activeTab, availableTabs]);

  useEffect(() => {
    setPanel((previous) => {
      const nextWidth = clamp(previous.initialized ? previous.width : Math.round(sceneSize * 0.34), MIN_WIDTH, Math.max(MIN_WIDTH, sceneSize - 28));
      const nextHeight = clamp(previous.initialized ? previous.height : Math.round(sceneSize * 0.46), MIN_HEIGHT, Math.max(MIN_HEIGHT, sceneSize - 120));
      const nextX = previous.initialized ? previous.x : sceneSize - nextWidth - 18;
      const nextY = previous.initialized ? previous.y : Math.round(sceneSize * 0.18);
      return {
        x: clamp(nextX, 12, Math.max(12, sceneSize - nextWidth - 12)),
        y: clamp(nextY, 84, Math.max(84, sceneSize - nextHeight - 12)),
        width: nextWidth,
        height: nextHeight,
        minimized: previous.minimized,
        initialized: true,
      };
    });
  }, [sceneSize]);

  useEffect(() => {
    panelRef.current = panel;
  }, [panel]);

  useEffect(() => {
    if (!interaction) return;

    const handlePointerMove = (event: PointerEvent) => {
      const deltaX = event.clientX - interaction.startX;
      const deltaY = event.clientY - interaction.startY;

      setPanel((previous) => {
        if (interaction.type === "drag") {
          const nextX = clamp(interaction.panel.x + deltaX, 12, Math.max(12, sceneSize - previous.width - 12));
          const nextY = clamp(interaction.panel.y + deltaY, 84, Math.max(84, sceneSize - previous.height - 12));
          return { ...previous, x: nextX, y: nextY };
        }

        const nextWidth = clamp(interaction.panel.width + deltaX, MIN_WIDTH, Math.max(MIN_WIDTH, sceneSize - previous.x - 12));
        const nextHeight = clamp(interaction.panel.height + deltaY, MIN_HEIGHT, Math.max(MIN_HEIGHT, sceneSize - previous.y - 12));
        return { ...previous, width: nextWidth, height: nextHeight };
      });
    };

    const handlePointerUp = () => {
      setInteraction(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [interaction, sceneSize]);

  const featuredCallouts = callouts.filter((callout) => callout.projectId).slice(0, 2);
  const contentHeight = Math.max(0, panel.height - 66);

  return (
    <div
      className="absolute z-20"
      style={{
        left: panel.x,
        top: panel.y,
        width: panel.width,
      }}
    >
      <div
        ref={panelRef as never}
        className="overflow-hidden rounded-[24px] border-[3px] border-ink bg-[rgba(255,247,232,0.98)] shadow-[6px_6px_0_rgba(17,17,17,0.38)]"
      >
        <div
          className="flex cursor-grab items-center gap-2 border-b-[3px] border-ink bg-opYellow/45 px-3 py-2"
          onPointerDown={(event) => {
            const target = event.target as HTMLElement;
            if (target.closest("[data-social-control]")) return;
            setInteraction({
              type: "drag",
              startX: event.clientX,
              startY: event.clientY,
              panel,
            });
          }}
        >
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-ink">Trading Floor Social</p>
            <p className="truncate text-[10px] font-semibold text-ink/70">
              Drag, resize, minimize. Call outs can drive the center chart.
            </p>
          </div>
          <button
            type="button"
            data-social-control
            onClick={() => setPanel((previous) => ({ ...previous, minimized: !previous.minimized }))}
            className="rounded-lg border-2 border-ink bg-[var(--panel-cream)] px-2 py-1 text-[10px] font-black text-ink"
          >
            {panel.minimized ? "Open" : "Min"}
          </button>
        </div>

        <div className="flex gap-1 border-b-[3px] border-ink/15 bg-[var(--panel-cream)] px-3 py-2">
          {availableTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] transition-colors ${
                activeTab === tab
                  ? "border-2 border-ink bg-opYellow text-ink"
                  : "border-2 border-ink/20 bg-white/70 text-ink/70 hover:border-ink hover:text-ink"
              }`}
            >
              {tab === "callouts" ? "Call Outs" : tab}
            </button>
          ))}
        </div>

        {!panel.minimized && (
          <div className="p-3" style={{ height: contentHeight }}>
            {activeTab === "chat" && (
              <div className="flex h-full min-h-0 flex-col gap-2">
                {featuredCallouts.length > 0 && (
                  <div className="grid gap-2">
                    {featuredCallouts.map((callout) => (
                      <button
                        key={callout.id}
                        type="button"
                        onClick={() => onSelectCallout(callout)}
                        className="rounded-[18px] border-[3px] border-ink bg-opYellow/20 px-3 py-2 text-left transition-colors hover:bg-opYellow/35"
                      >
                        <div className="flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-ink">
                          <span>{callout.projectTicker ? `${callout.projectTicker} Super Chat` : "Floor Signal"}</span>
                          <span>{new Date(callout.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                        <p className="mt-1 text-xs font-semibold text-ink/75">{callout.content}</p>
                      </button>
                    ))}
                  </div>
                )}
                <div className="min-h-0 flex-1 rounded-[18px] border-[3px] border-ink/20 bg-white/80 p-3">
                  <ChatBox
                    embedded
                    hideHeader
                    messages={chat}
                    walletAddress={walletAddress}
                    muteUntil={muteUntil}
                    onMessageSent={onMessageSent}
                    className="h-full"
                  />
                </div>
              </div>
            )}

            {activeTab === "callouts" && (
              <div className="h-full rounded-[18px] border-[3px] border-ink/20 bg-white/80 p-3">
                <CalloutFeed
                  embedded
                  callouts={callouts}
                  walletAddress={walletAddress}
                  ticker={ticker}
                  onCalloutPosted={onCalloutPosted}
                  onReacted={onReacted}
                  onCalloutSelect={onSelectCallout}
                  className="h-full"
                />
              </div>
            )}

            {activeTab === "clan" && clan && (
              <div className="flex h-full min-h-0 flex-col gap-3 rounded-[18px] border-[3px] border-ink/20 bg-white/80 p-4">
                <div className="rounded-[18px] border-[3px] border-ink bg-[var(--panel-cream)] p-3">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-ink">
                    [{clan.tag}] {clan.name}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{clan.bio || "No clan bio set yet."}</p>
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/65">
                    {clan.memberCount} members live on the street
                  </p>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto rounded-[18px] border-[3px] border-ink bg-[var(--panel-cream)] p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-ink/70">Members</p>
                  <div className="mt-2 space-y-2">
                    {clan.members.map((member) => (
                      <div
                        key={member}
                        className="rounded-xl border-2 border-ink/15 bg-white/80 px-3 py-2 text-xs font-semibold text-ink"
                      >
                        {member === clan.ownerWallet ? `${member.slice(0, 10)}... (Leader)` : `${member.slice(0, 10)}...`}
                      </div>
                    ))}
                  </div>
                </div>
                <a
                  href="/clans"
                  className="inline-flex items-center justify-center rounded-[18px] border-[3px] border-ink bg-opYellow px-3 py-2 text-xs font-black text-ink"
                >
                  Open Clan Room
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      {!panel.minimized && (
        <button
          type="button"
          data-social-control
          onPointerDown={(event) => {
            event.preventDefault();
            setInteraction({
              type: "resize",
              startX: event.clientX,
              startY: event.clientY,
              panel,
            });
          }}
          className="absolute bottom-1.5 right-1.5 h-4 w-4 cursor-se-resize rounded-sm border-2 border-ink bg-opYellow/90"
          aria-label="Resize social panel"
        />
      )}
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
