import { HeroSection } from "@/components/landing/HeroSection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { FeatureCardsStrip } from "@/components/landing/FeatureCardsStrip";
import { RoadmapSection } from "@/components/landing/RoadmapSection";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  return (
    <div className="pb-28 sm:pb-10 space-y-10 sm:space-y-14">

      {/* Hero */}
      <div className="rounded-2xl border-3 border-ink bg-[var(--panel-cream)] shadow-[8px_8px_0_#111111] overflow-hidden">
        <HeroSection />
      </div>

      {/* How It Works — standalone section */}
      <HowItWorksSection />

      {/* Key Features — standalone section */}
      <FeatureCardsStrip />

      {/* Roadmap */}
      <RoadmapSection />

    </div>
  );
}
