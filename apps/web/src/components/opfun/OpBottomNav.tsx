"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { OpIcon } from "./OpIcon";
import { useWallet } from "@/components/WalletProvider";
import { fetchClanLicenseStatus } from "@/lib/api";

type TabItem = {
  href: string;
  icon: string;
  label: string;
};

export function OpBottomNav() {
  const pathname = usePathname();
  const { wallet } = useWallet();
  const walletAddress = wallet?.address;
  const [clansUnlocked, setClansUnlocked] = useState(false);

  useEffect(() => {
    let mounted = true;

    const refresh = () => {
      if (!walletAddress) {
        if (mounted) setClansUnlocked(false);
        return;
      }
      fetchClanLicenseStatus(walletAddress)
        .then((res) => {
          if (mounted) setClansUnlocked(res.clansUnlocked);
        })
        .catch(() => {
          if (mounted) setClansUnlocked(false);
        });
    };

    refresh();
    window.addEventListener("opstreet:licenses-updated", refresh);
    return () => {
      mounted = false;
      window.removeEventListener("opstreet:licenses-updated", refresh);
    };
  }, [walletAddress]);

  const tabs: TabItem[] = [
    { href: "/", icon: "nav_feed", label: "Home" },
    { href: "/trending", icon: "nav_trending", label: "Trending" },
    { href: "/floor", icon: "nav_floor", label: "Floor" },
    { href: "/leaderboards", icon: "nav_wallet", label: "Leaders" },
    { href: clansUnlocked ? "/clans" : "/shop", icon: "shield", label: clansUnlocked ? "Clans" : "Shop" },
  ];

  function isActive(href: string) {
    return pathname === href || (href !== "/" && pathname.startsWith(href));
  }

  return (
    <div className="fixed bottom-4 left-3 right-3 z-50 flex items-end gap-3 sm:hidden">
      <nav className="flex flex-1 items-center justify-around rounded-[28px] border-3 border-ink bg-opYellow px-4 py-2.5 shadow-[4px_4px_0_#111111]">
        {tabs.map((tab) => (
          <Link key={`${tab.href}-${tab.label}`} href={tab.href} className="flex min-w-0 flex-col items-center gap-0.5">
            <div className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${isActive(tab.href) ? "border-2 border-ink bg-ink/10" : ""}`}>
              <OpIcon name={tab.icon} size={22} />
            </div>
            <span className={`text-[9px] font-black leading-none ${isActive(tab.href) ? "text-ink" : "text-ink/60"}`}>
              {tab.label}
            </span>
          </Link>
        ))}
      </nav>

      <Link
        href="/create"
        className="mb-0.5 flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-3 border-ink bg-opYellow shadow-[4px_4px_0_#111111] transition-all active:translate-x-1 active:translate-y-1 active:shadow-none"
        aria-label="Create coin"
      >
        <OpIcon name="plus" size={30} />
      </Link>
    </div>
  );
}
