"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { label: "Feed", href: "/" },
  { label: "Trending", href: "/?sort=trending" },
  { label: "Create coin", href: "/create", cta: true },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close drawer on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* Hamburger button — mobile only */}
      <button
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="sm:hidden flex flex-col justify-center items-center w-9 h-9 gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 transition-colors"
      >
        <span
          className={`block h-0.5 w-5 bg-zinc-300 rounded transition-all duration-200 ${
            open ? "translate-y-2 rotate-45" : ""
          }`}
        />
        <span
          className={`block h-0.5 w-5 bg-zinc-300 rounded transition-all duration-200 ${
            open ? "opacity-0" : ""
          }`}
        />
        <span
          className={`block h-0.5 w-5 bg-zinc-300 rounded transition-all duration-200 ${
            open ? "-translate-y-2 -rotate-45" : ""
          }`}
        />
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 sm:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Slide-in drawer */}
      <div
        className={`fixed inset-y-0 right-0 z-50 w-64 bg-zinc-900 border-l border-zinc-800 p-6 flex flex-col gap-2 sm:hidden
          transition-transform duration-200 ease-in-out ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center justify-between mb-6">
          <span className="text-sm font-black text-white">
            OP<span className="text-brand-500">Fun</span>
          </span>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="text-zinc-500 hover:text-white text-lg leading-none"
          >
            ✕
          </button>
        </div>
        {NAV_LINKS.map(({ label, href, cta }) => (
          <a
            key={href}
            href={href}
            className={
              cta
                ? "btn-primary text-center mt-2"
                : "rounded-xl px-4 py-3 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
            }
          >
            {label}
          </a>
        ))}
        <div className="mt-auto pt-6 border-t border-zinc-800 text-[10px] text-zinc-600">
          OP_NET Testnet Only · No real money
        </div>
      </div>
    </>
  );
}
