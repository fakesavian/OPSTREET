"use client";
import Image from "next/image";
export function OpIcon({ name, size = 20, className = "" }: { name: string; size?: number; className?: string }) {
  return <Image src={`/assets/opfun/icons/${name}.svg`} alt={name} width={size} height={size} className={className} />;
}
