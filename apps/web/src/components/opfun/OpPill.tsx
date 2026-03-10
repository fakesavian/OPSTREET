"use client";
type Color = "yellow" | "green" | "red" | "default";
const colorMap: Record<Color, string> = {
  yellow: "bg-opYellow border-ink text-ink",
  green:  "bg-opGreen border-ink text-white",
  red:    "bg-opRed border-ink text-white",
  default: "",
};
export function OpPill({ label, active, onClick, color = "default" }: { label: string; active?: boolean; onClick?: () => void; color?: Color }) {
  return (
    <button
      onClick={onClick}
      className={`op-pill ${active ? "op-pill-active" : ""} ${colorMap[color]}`}
    >
      {label}
    </button>
  );
}
