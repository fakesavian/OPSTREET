"use client";

import { useEffect, useRef, useState } from "react";
import { useNotifications } from "@/context/NotificationContext";

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const TYPE_ICONS: Record<string, string> = {
  reservation: "TKT",
  deploy: "UP",
  trade: "$",
  system: "!",
};

export function NotificationDropdown() {
  const { notifications, markAllRead, unreadCount } = useNotifications();
  const [open, setOpen] = useState(false);
  const [prevCount, setPrevCount] = useState(unreadCount);
  const [popKey, setPopKey] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (unreadCount > prevCount) {
      setPopKey((k) => k + 1);
    }
    setPrevCount(unreadCount);
  }, [unreadCount, prevCount]);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border-2 border-ink bg-[var(--panel-cream)] transition-colors hover:bg-opYellow"
        aria-label="Notifications"
      >
        <svg viewBox="0 0 20 20" className="h-5 w-5 text-ink" fill="currentColor">
          <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM8 16a2 2 0 104 0H8z" />
        </svg>

        {unreadCount > 0 && (
          <span
            key={popKey}
            className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-opRed px-1 text-[9px] font-black text-white animate-count-pop"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-[70] mt-2 w-72 overflow-hidden rounded-[22px] border-[3px] border-ink bg-[linear-gradient(180deg,#fff8e8_0%,#ffe69a_100%)] shadow-hard animate-slide-down">
          <div className="flex items-center justify-between border-b-2 border-ink/15 px-4 py-3">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-ink">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead()}
                className="text-[10px] font-black text-[#7a4d18] hover:text-ink"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-64 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs font-semibold text-[var(--text-muted)]">No notifications yet</div>
            ) : (
              notifications.slice(0, 20).map((n) => (
                <div
                  key={n.id}
                  className={`flex gap-3 border-b-2 border-ink/10 px-4 py-3 ${n.read ? "opacity-70" : ""}`}
                >
                  <span className="mt-0.5 inline-flex h-6 min-w-[2rem] items-center justify-center rounded-full border-2 border-ink bg-[var(--panel-cream)] text-[9px] font-black text-ink">
                    {TYPE_ICONS[n.type] ?? "NEW"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-black text-ink">{n.title}</p>
                    <p className="truncate text-[10px] font-semibold text-[var(--text-secondary)]">{n.message}</p>
                    <p className="mt-0.5 text-[9px] font-semibold text-[var(--text-muted)]">{relativeTime(n.timestamp)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
