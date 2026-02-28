import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OPFun Secure Launchpad",
  description: "Launch fast on OP_NET — with a Risk Card on every token.",
  keywords: ["opnet", "bitcoin", "token", "launchpad", "security"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-zinc-950">
        <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <a href="/" className="flex items-center gap-2">
              <span className="text-xl font-black tracking-tight text-white">
                OP<span className="text-brand-500">Fun</span>
              </span>
              <span className="hidden rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400 sm:inline">
                Secure Launchpad
              </span>
            </a>
            <nav className="flex items-center gap-3">
              <a href="/" className="text-sm text-zinc-400 hover:text-white transition-colors">
                Feed
              </a>
              <a href="/create" className="btn-primary">
                Launch Token
              </a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <footer className="border-t border-zinc-800 py-6 text-center text-xs text-zinc-600">
          OPFun Secure Launchpad · OP_NET Testnet Only · No real money
        </footer>
      </body>
    </html>
  );
}
