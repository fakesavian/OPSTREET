"use client";
export function OpIcon({ name, size = 20, className = "" }: { name: string; size?: number; className?: string }) {
  return <img src={`/assets/opfun/icons/${name}.svg`} alt={name} width={size} height={size} className={className} />;
}
