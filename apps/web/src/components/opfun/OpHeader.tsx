"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { WalletButton } from "@/components/WalletButton";
import { MobileNav } from "@/components/MobileNav";
import { useWallet } from "@/components/WalletProvider";
import { fetchClanLicenseStatus } from "@/lib/api";
import { NotificationDropdown } from "./NotificationDropdown";

export function OpHeader() {
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

  return (
    <header className="border-b-3 border-ink bg-[var(--panel-cream)]">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex shrink-0 items-center" aria-label="OpStreet home">
            <Image
              src="/opstreet/brand/logo.png"
              alt="OpStreet"
              width={160}
              height={40}
              priority
              className="object-contain"
            />
          </Link>

          <nav className="hidden items-center gap-1.5 sm:flex pr-6">
            {[
              { href: "/trending", label: "Trending" },
              { href: "/players", label: "Search", search: true },
              { href: "/floor", label: "Floor" },
              { href: "/shop", label: "Shop" },
              { href: "/docs", label: "Docs" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="op-link-highlight flex items-center gap-1.5 rounded-lg border-2 border-transparent px-3 py-1.5 text-xs font-bold text-ink transition-colors hover:border-ink hover:bg-opYellow"
              >
                {item.search && (
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                )}
                {item.label}
              </Link>
            ))}

            {clansUnlocked ? (
              <Link
                href="/clans"
                className="op-link-highlight rounded-lg border-2 border-transparent px-3 py-1.5 text-xs font-bold text-ink transition-colors hover:border-ink hover:bg-opYellow"
              >
                Clans
              </Link>
            ) : (
              <span
                title="Buy Clan Access License in Shop"
                className="cursor-not-allowed rounded-lg border-2 border-transparent px-3 py-1.5 text-xs font-bold text-[var(--text-muted)] opacity-70"
              >
                Clans 🔒
              </span>
            )}

            <a
              href="https://motoswap.org"
              target="_blank"
              rel="noopener noreferrer"
              className="op-link-highlight rounded-lg border-2 border-transparent px-3 py-1.5 text-xs font-bold text-ink transition-colors hover:border-ink hover:bg-opYellow"
            >
              Swap ↗
            </a>

            <div className="relative">
              <button
                disabled
                className="mr-5 cursor-not-allowed rounded-lg border-2 border-transparent px-3 py-1.5 text-xs font-bold text-[var(--text-muted)] opacity-60"
              >
                Staking
              </button>
              <span className="absolute -right-1 -top-2 whitespace-nowrap rounded border border-ink bg-opRed px-1 py-0.5 text-[8px] font-black leading-none text-white">
                SOON
              </span>
            </div>
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden sm:block">
            <NotificationDropdown />
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <WalletButton />
            <Link href="/create" className="op-btn-primary px-5 py-2.5 text-sm font-black whitespace-nowrap">
              + Create Coin
            </Link>
          </div>
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
