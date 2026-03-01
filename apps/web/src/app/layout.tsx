import type { Metadata } from "next";
import "./globals.css";
import { MobileNav } from "@/components/MobileNav";

export const metadata: Metadata = {
  title: "OPFun Secure Launchpad",
  description: "Launch fast on OP_NET — with a Risk Card on every token.",
  keywords: ["opnet", "bitcoin", "token", "launchpad", "security"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-zinc-950">
        <header className="sticky top-0 z-50 border-b-2 border-zinc-800 bg-[#0a0a0a]/95 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-6">
              <a href="/" className="flex items-center gap-2">
                <span className="text-lg font-black tracking-tight text-white">
                  OP<span className="text-brand-500">Fun</span>
                </span>
                <span className="hidden rounded-md border-2 border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[10px] font-black text-zinc-500 sm:inline">
                  TESTNET
                </span>
              </a>
              {/* Desktop nav */}
              <nav className="hidden sm:flex items-center gap-1">
                <a href="/" className="rounded-lg px-3 py-1.5 text-xs font-bold text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors">
                  Feed
                </a>
                <a href="/?sort=trending" className="rounded-lg px-3 py-1.5 text-xs font-bold text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors">
                  Trending
                </a>
              </nav>
            </div>
            {/* Desktop CTA + Mobile hamburger */}
            <div className="flex items-center gap-2">
              <a href="/create" className="hidden sm:inline-flex btn-primary text-xs px-4 py-2">
                + Create coin
              </a>
              <MobileNav />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <footer className="border-t-2 border-zinc-800 py-6 text-center text-xs text-zinc-600">
          OPFun Secure Launchpad · OP_NET Testnet Only · No real money
        </footer>
      </body>
    </html>
  );
}
