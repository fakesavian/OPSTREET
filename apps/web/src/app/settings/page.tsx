"use client";

import { useEffect, useState } from "react";

const SOUND_KEY = "opstreet_sound";

function getSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(SOUND_KEY) !== "off";
}

function setSoundEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SOUND_KEY, enabled ? "on" : "off");
}

export default function SettingsPage() {
  const [soundEnabled, setSoundEnabledState] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSoundEnabledState(getSoundEnabled());
    setMounted(true);
  }, []);

  function handleToggleSound() {
    const next = !soundEnabled;
    setSoundEnabledState(next);
    setSoundEnabled(next);
    // Preview: play a quick sound if turning on
    if (next) {
      try {
        const audio = new Audio("/sounds/coins-drop.mp3");
        audio.volume = 0.5;
        void audio.play();
      } catch {
        // Ignore
      }
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-24 sm:pb-10">
      <section className="op-panel p-6">
        <h1 className="text-2xl font-black text-ink">Settings</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Customize your OPStreet experience.</p>
      </section>

      <section className="op-panel p-6">
        <h2 className="text-xl font-black text-ink">Sound</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Toggle audio feedback for events like block confirmations.</p>

        <div className="mt-5 rounded-[18px] border-[3px] border-ink bg-[var(--panel-cream)] p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-black text-ink">Sound Effects</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Plays audio on block confirmation, rewards, and other events.
              </p>
            </div>

            {/* Toggle switch */}
            <button
              type="button"
              role="switch"
              aria-checked={soundEnabled}
              onClick={handleToggleSound}
              disabled={!mounted}
              className={`relative h-7 w-14 shrink-0 rounded-full border-[3px] border-ink transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
                soundEnabled ? "bg-[#4ade80]" : "bg-[#d4d4d4]"
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full border-[2px] border-ink bg-white shadow transition-transform duration-200 ${
                  soundEnabled ? "translate-x-7" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border-[2px] border-ink px-3 py-1 font-mono text-[10px] font-black uppercase tracking-widest ${
                soundEnabled ? "bg-[#dcfce7] text-[#15803d]" : "bg-[#f4f4f5] text-[#71717a]"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${soundEnabled ? "bg-[#22c55e]" : "bg-[#a1a1aa]"}`}
              />
              {soundEnabled ? "On" : "Off"}
            </span>
            <span className="text-xs text-[var(--text-muted)]">
              {soundEnabled
                ? "Sound effects are active. You'll hear a coin drop on block confirmation."
                : "Sound effects are muted. Toggle to re-enable."}
            </span>
          </div>
        </div>
      </section>

      <section className="op-panel p-6">
        <h2 className="text-xl font-black text-ink">About</h2>
        <div className="mt-4 space-y-3">
          <div className="rounded-[18px] border-[3px] border-ink bg-[var(--panel-cream)] p-4">
            <p className="text-sm font-black text-ink">OPStreet Launchpad</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              A Bitcoin-native token launchpad built on OPNet. Launch, trade, and track tokens
              directly on Bitcoin Layer 1.
            </p>
          </div>
          <div className="rounded-[18px] border-[3px] border-ink bg-[var(--panel-cream)] p-4">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--text-muted)]">Network</p>
            <p className="mt-1 text-sm font-semibold text-ink">OPNet Testnet (Signet-based)</p>
          </div>
        </div>
      </section>
    </div>
  );
}
