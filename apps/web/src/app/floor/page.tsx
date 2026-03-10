import type { Metadata } from "next";
import { TradingFloorClient } from "@/components/floor/TradingFloorClient";

export const metadata: Metadata = {
  title: "Trading Floor - OpStreet",
  description: "The live trading floor. Post alpha callouts, chat with the community, and track token launches.",
};

export default function FloorPage() {
  return <TradingFloorClient />;
}

