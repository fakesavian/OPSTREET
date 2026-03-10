"use client";
import { OpPill } from "./OpPill";
export function OpTickerStrip({ items, onSelect }: { items: { label: string; active?: boolean }[]; onSelect: (label: string) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide" style={{ scrollSnapType: "x mandatory" }}>
      {items.map((item) => (
        <div key={item.label} style={{ scrollSnapAlign: "start" }} className="shrink-0">
          <OpPill label={item.label} active={item.active} onClick={() => onSelect(item.label)} />
        </div>
      ))}
    </div>
  );
}
