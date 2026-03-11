"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[OpStreet] Global error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ background: "#FFD84D", fontFamily: "sans-serif", margin: 0 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            padding: "2rem",
            textAlign: "center",
          }}
        >
          <div
            style={{
              background: "#FFFBEB",
              border: "3px solid #111",
              borderRadius: 16,
              boxShadow: "8px 8px 0 #111",
              padding: "2rem",
              maxWidth: 400,
              width: "100%",
            }}
          >
            <h2 style={{ fontSize: "1.5rem", fontWeight: 900, color: "#111", marginBottom: "0.5rem" }}>
              Application error
            </h2>
            <p style={{ fontSize: "0.875rem", color: "#666", marginBottom: "1.5rem", fontFamily: "monospace" }}>
              {error.message ?? "A critical error occurred. Please refresh."}
            </p>
            <button
              onClick={reset}
              style={{
                background: "#FFD84D",
                border: "3px solid #111",
                borderRadius: 10,
                boxShadow: "5px 5px 0 #111",
                fontWeight: 900,
                color: "#111",
                padding: "0.5rem 1.25rem",
                cursor: "pointer",
                width: "100%",
              }}
            >
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
