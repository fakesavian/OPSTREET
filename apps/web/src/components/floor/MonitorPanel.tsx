import type { ReactNode } from "react";

interface Props {
  label: string | ReactNode;
  children: ReactNode;
  className?: string;
}

export function MonitorPanel({ label, children, className = "" }: Props) {
  return (
    <div
      className={`relative flex min-h-0 flex-col overflow-hidden rounded-2xl border-[3px] border-ink bg-[var(--panel-cream)] shadow-[4px_4px_0_#111] ${className}`}
      style={{
        backgroundImage: "url(/assets/opfun/ui/monitor_frame.svg)",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.2)_0%,rgba(255,255,255,0)_20%)] pointer-events-none" />

      <div className="relative z-10 flex shrink-0 items-center gap-1.5 border-b-2 border-ink bg-black/85 px-2 py-1">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.8)]" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-opYellow">{label}</span>
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 overflow-hidden border-t border-black/30 bg-[linear-gradient(180deg,#f9eed8_0%,#f5e5c2_100%)]">
        {children}
      </div>

      <div className="pointer-events-none absolute inset-0 z-20 bg-[repeating-linear-gradient(0deg,transparent,transparent_3px,rgba(0,0,0,0.04)_3px,rgba(0,0,0,0.04)_6px)]" />
    </div>
  );
}
