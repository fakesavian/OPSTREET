"use client";
import { ReactNode } from "react";

export function OpPanel({ title, children, className = "" }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`op-panel p-5 ${className}`}>
      {title && <div className="mb-3 text-sm font-black uppercase tracking-wider text-ink border-b-3 border-ink pb-2">{title}</div>}
      {children}
    </div>
  );
}
