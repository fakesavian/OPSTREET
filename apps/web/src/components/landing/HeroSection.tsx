import Link from "next/link";
import Image from "next/image";

export function HeroSection() {
  return (
    <div className="grid lg:grid-cols-2 border-b-3 border-ink">
      {/* Left: copy */}
      <div className="p-6 sm:p-10 flex flex-col justify-center gap-5">
        <h1 className="text-4xl sm:text-5xl font-black text-ink leading-[1.08] tracking-tight">
          Welcome to OPSTREET
        </h1>
        <p className="text-sm sm:text-[15px] text-[var(--text-secondary)] max-w-xl leading-relaxed">
          Launch tokens, build a following, and battle it out on the trade floor.
          A Bitcoin Layer 1 DeFi community ecosystem game where callouts, clans,
          and wins actually matter.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/create" className="op-btn-primary px-5 py-2.5 text-sm font-black">
            Create Token
          </Link>
          <Link href="/floor" className="op-btn-outline px-5 py-2.5 text-sm font-bold">
            Join Trading Floor
          </Link>
        </div>
        <a
          href="#how-it-works"
          className="text-xs font-bold text-[var(--text-muted)] hover:text-ink transition-colors mt-1"
        >
          How it works &rarr;
        </a>
      </div>

      {/* Right: hero image */}
      <div className="border-t-3 lg:border-t-0 lg:border-l-3 border-ink bg-opYellow/15 p-6 flex items-center justify-center min-h-[300px] sm:min-h-[400px] relative overflow-hidden">
        <div className="w-full rounded-2xl border-3 border-ink bg-[var(--panel-cream)] p-2 shadow-hard">
          <Image
            src="/opstreet/images/landing-hero.jpg"
            alt="OpStreet landing hero"
            width={680}
            height={520}
            className="h-[280px] w-full rounded-xl border-2 border-ink object-cover sm:h-[360px]"
          />
        </div>
      </div>
    </div>
  );
}
