"use client";
import { ReactNode } from "react";
import { OpIcon } from "./OpIcon";
export function OpFAB({ onClick, alwaysShow, children }: { onClick?: () => void; alwaysShow?: boolean; children?: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`${alwaysShow ? "flex" : "flex sm:hidden"} fixed bottom-20 right-4 z-50 h-14 w-14 items-center justify-center rounded-full bg-opYellow border-3 border-ink shadow-hard-sm transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[3px_3px_0_#111111] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none`}
      aria-label="Action"
    >
      {children ?? <OpIcon name="plus" size={24} />}
    </button>
  );
}
