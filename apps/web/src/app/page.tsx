import { fetchProjects } from "@/lib/api";
import { FeedClient } from "@/components/FeedClient";

export const revalidate = 10;

export default async function HomePage() {
  let projects = await fetchProjects("new").catch(() => []);

  return (
    <div className="space-y-12">
      {/* Hero — compact, pump.fun-inspired */}
      <section className="relative text-center py-6">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-48 w-48 rounded-full bg-brand-500/8 blur-3xl" />
        </div>
        <div className="relative">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1 text-[11px] text-zinc-500">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
            OP_NET Testnet · Safe defaults · No real funds
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
            Launch a token on Bitcoin.{" "}
            <span className="text-brand-500">With a Risk Card.</span>
          </h1>
          <p className="mt-3 text-base text-zinc-500 max-w-xl mx-auto">
            Every launch gets an automated security audit, transparent Risk Card, and live Watchtower monitoring — powered by Bob AI.
          </p>
          <div className="mt-5 flex flex-col sm:flex-row gap-2 justify-center">
            <a href="/create" className="btn-primary px-6 py-2.5 shadow-md shadow-brand-500/20">
              Create coin →
            </a>
            <a href="#feed" className="btn-secondary px-6 py-2.5">
              Browse coins ↓
            </a>
          </div>
          {/* Live stats */}
          <div className="mt-6 flex flex-wrap justify-center gap-6 text-sm divide-x divide-zinc-800">
            <Stat label="Tokens" value={String(projects.length)} />
            <Stat label="Live" value={String(projects.filter((p) => p.status === "LAUNCHED" || p.status === "GRADUATED").length)} />
            <Stat label="Pledges" value={String(projects.reduce((s, p) => s + p.pledgeCount, 0))} />
            <Stat label="Graduated" value={String(projects.filter((p) => p.status === "GRADUATED").length)} />
          </div>
        </div>
      </section>

      {/* Feed */}
      <FeedClient initialProjects={projects} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-black text-white">{value}</p>
      <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
    </div>
  );
}
