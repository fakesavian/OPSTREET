"use client";
type Variant = "testnet" | "live" | "draft" | "risk-low" | "risk-med" | "risk-high";
const cssMap: Record<Variant, string> = {
  testnet:    "",
  live:       "bg-opGreen border-ink text-white",
  draft:      "bg-[#e5e7eb] border-ink text-ink",
  "risk-low": "bg-opGreen border-ink text-white",
  "risk-med": "bg-opYellow border-ink text-ink",
  "risk-high":"bg-opRed border-ink text-white",
};
import Image from "next/image";
export function OpBadge({ variant }: { variant: Variant }) {
  if (variant === "testnet") return <Image src="/assets/opfun/ui/pill_testnet.svg" alt="TESTNET" width={96} height={24} className="h-6 w-auto" />;
  const labels: Record<Variant, string> = { testnet:"", live:"LIVE", draft:"DRAFT", "risk-low":"LOW RISK", "risk-med":"MED RISK", "risk-high":"HIGH RISK" };
  return <span className={`inline-flex items-center rounded-full border-2 px-2.5 py-0.5 text-[10px] font-black ${cssMap[variant]}`}>{labels[variant]}</span>;
}
