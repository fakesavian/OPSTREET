import type { ReactNode } from "react";

/**
 * Full-bleed layout escape for the Trading Floor page.
 *
 * The root layout applies `mx-auto max-w-6xl px-4 py-8` to <main>.
 * This wrapper counteracts those constraints so the floor scene can
 * fill the full viewport width and remove the top/bottom padding.
 */
export default function FloorLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        width: "100vw",
        position: "relative",
        left: "50%",
        marginLeft: "-50vw",
        marginRight: "-50vw",
        marginTop: "calc(-1 * var(--layout-y-pad))",    // negates root layout's --layout-y-pad — see globals.css
        marginBottom: "calc(-1 * var(--layout-y-pad))",  // negates root layout's --layout-y-pad — see globals.css
      }}
    >
      {children}
    </div>
  );
}
