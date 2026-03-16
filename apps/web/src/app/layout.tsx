import type { Metadata } from "next";
import "./globals.css";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { WalletProvider } from "@/components/WalletProvider";
import { OpHeader } from "@/components/opfun/OpHeader";
import { OpBottomNav } from "@/components/opfun/OpBottomNav";
import { BlockTimerBar } from "@/components/opfun/BlockTimerBar";
import { NotificationProvider } from "@/context/NotificationContext";
import { PendingTxProvider } from "@/context/PendingTxContext";
import { PersistentTxOverlay } from "@/components/PersistentTxOverlay";

export const metadata: Metadata = {
  title: "OpStreet",
  description: "Launch fast on OP_NET - with a Risk Card on every token.",
  keywords: ["opnet", "bitcoin", "token", "launchpad", "security"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <WalletProvider>
          <PendingTxProvider>
          <NotificationProvider>
            <div className="sticky top-0 z-50">
              <BlockTimerBar />
              <OpHeader />
            </div>
            <main
              className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 sm:pb-16"
              style={{ paddingTop: "var(--layout-y-pad)" }}
            >
              {children}
            </main>
            <footer className="hidden sm:block sm:fixed sm:bottom-0 sm:left-0 sm:right-0 sm:z-40 border-t-3 border-ink bg-[var(--panel-cream)] px-4 py-3">
              <div className="mx-auto flex max-w-6xl items-center justify-between">
                <span className="text-xs font-bold text-[var(--text-muted)]">
                  OpStreet &mdash; Powered by OP_NET
                </span>
                <div className="flex gap-5">
                  {[
                    "Links",
                    "About",
                    "Blog",
                    "Events",
                  ].map((label) => (
                    <a key={label} href="#" className="text-xs font-bold text-ink transition-colors hover:text-opGreen">
                      {label}
                    </a>
                  ))}
                </div>
              </div>
            </footer>
            <OpBottomNav />
            <PersistentTxOverlay />
            <SpeedInsights />
          </NotificationProvider>
          </PendingTxProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
