"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { WalletButton } from "./WalletButton";
import { useWallet } from "./WalletProvider";
import { fetchClanLicenseStatus } from "@/lib/api";

type NavLink = {
  label: string;
  href: string;
  cta?: boolean;
  external?: boolean;
  locked?: boolean;
};

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { wallet } = useWallet();
  const walletAddress = wallet?.address;
  const [clansUnlocked, setClansUnlocked] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

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

  const navLinks: NavLink[] = [
    { label: "Trending", href: "/trending" },
    { label: "Leaders", href: "/leaderboards" },
    { label: "Players", href: "/players" },
    { label: "Floor", href: "/floor" },
    { label: "Shop", href: "/shop" },
    { label: clansUnlocked ? "Clans" : "Clans (Locked)", href: clansUnlocked ? "/clans" : "/shop", locked: !clansUnlocked },
    { label: "Docs", href: "/docs" },
    { label: "Swap", href: "https://motoswap.org", external: true },
    { label: "+ Create Coin", href: "/create", cta: true },
  ];

  return (
    <>
      <button
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-10 flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-ink bg-opYellow transition-colors hover:bg-opYellow/80 sm:hidden"
      >
        <span className={`block h-0.5 w-5 rounded bg-ink transition-all duration-200 ${open ? "translate-y-2 rotate-45" : ""}`} />
        <span className={`block h-0.5 w-5 rounded bg-ink transition-all duration-200 ${open ? "opacity-0" : ""}`} />
        <span className={`block h-0.5 w-5 rounded bg-ink transition-all duration-200 ${open ? "-translate-y-2 -rotate-45" : ""}`} />
      </button>

      {open && <div className="fixed inset-0 z-40 bg-black/60 sm:hidden" onClick={() => setOpen(false)} aria-hidden="true" />}

      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-72 flex-col border-l-3 border-ink bg-[var(--panel-cream)] p-6 transition-transform duration-200 ease-in-out sm:hidden ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="mb-6 flex items-center justify-between">
          <img
            src="/opstreet/brand/logo.png"
            alt="OpStreet"
            className="h-12 w-auto rounded-lg object-contain"
          />
          <button onClick={() => setOpen(false)} aria-label="Close menu" className="text-lg leading-none text-ink hover:text-ink/70">
            X
          </button>
        </div>

        <nav className="flex flex-col gap-1">
          {navLinks.map(({ label, href, cta, external, locked }) =>
            external ? (
              <a
                key={`${href}-${label}`}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={cta ? "op-btn-primary mt-2 text-center" : `rounded-xl border-2 border-transparent px-4 py-3 text-sm font-bold ${locked ? "text-[var(--text-muted)]" : "text-ink hover:border-ink hover:bg-opYellow"}`}
              >
                {label}
              </a>
            ) : (
              <Link
                key={`${href}-${label}`}
                href={href}
                onClick={() => setOpen(false)}
                className={cta ? "op-btn-primary mt-2 text-center" : `rounded-xl border-2 border-transparent px-4 py-3 text-sm font-bold ${locked ? "text-[var(--text-muted)]" : "text-ink hover:border-ink hover:bg-opYellow"}`}
              >
                {label}
              </Link>
            ),
          )}
        </nav>

        <div className="relative mt-2 w-fit">
          <button
            disabled
            className="cursor-not-allowed rounded-xl border-2 border-transparent px-4 py-3 text-left text-sm font-bold text-[var(--text-muted)] opacity-60"
          >
            Staking
          </button>
          <span className="absolute right-2 top-2 rounded border border-ink bg-opRed px-1.5 py-0.5 text-[8px] font-black leading-none text-white">
            SOON
          </span>
        </div>

        <div className="mt-4 border-t-2 border-ink/20 pt-4">
          <p className="mb-2 text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Wallet</p>
          <WalletButton variant="mobile" />
        </div>

        <div className="mt-auto pt-4 text-[10px] font-bold text-[var(--text-muted)]">OpStreet &middot; Powered by OP_NET</div>
      </aside>
    </>
  );
}

