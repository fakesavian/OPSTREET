"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[OpStreet] Page error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-32 text-center gap-6">
      <div className="op-panel p-8 max-w-md w-full">
        <h2 className="text-2xl font-black text-ink mb-2">Something went wrong</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 font-mono break-words">
          {error.message ?? "An unexpected error occurred."}
        </p>
        <button onClick={reset} className="op-btn-primary w-full">
          Try again
        </button>
      </div>
    </div>
  );
}
