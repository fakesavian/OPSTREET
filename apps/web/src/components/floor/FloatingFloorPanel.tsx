"use client";

import { useEffect, useRef, useState } from "react";

export type PanelRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Bounds = {
  minX: number;
  minY: number;
  width: number;
  height: number;
};

function clampRect(rect: PanelRect, bounds: Bounds, minWidth: number, minHeight: number): PanelRect {
  const width = Math.min(Math.max(rect.width, minWidth), Math.max(minWidth, bounds.width));
  const height = Math.min(Math.max(rect.height, minHeight), Math.max(minHeight, bounds.height));
  const x = Math.min(Math.max(rect.x, bounds.minX), bounds.minX + bounds.width - width);
  const y = Math.min(Math.max(rect.y, bounds.minY), bounds.minY + bounds.height - height);
  return { x, y, width, height };
}

export function FloatingFloorPanel({
  title,
  children,
  initialRect,
  containerRef,
  fixed = false,
  minWidth = 240,
  minHeight = 220,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  initialRect: PanelRect;
  containerRef?: React.RefObject<HTMLElement>;
  fixed?: boolean;
  minWidth?: number;
  minHeight?: number;
  onClose?: () => void;
}) {
  const [rect, setRect] = useState<PanelRect>(initialRect);
  const interactionRef = useRef<{
    mode: "drag" | "resize";
    startX: number;
    startY: number;
    startRect: PanelRect;
  } | null>(null);

  function getBounds(): Bounds {
    if (fixed) {
      const minX = 12;
      const minY = 92;
      const width = Math.max(minWidth, window.innerWidth - 24);
      const height = Math.max(minHeight, window.innerHeight - 116);
      return { minX, minY, width, height };
    }

    const element = containerRef?.current;
    if (!element) {
      return { minX: 0, minY: 0, width: rect.width, height: rect.height };
    }
    return {
      minX: 0,
      minY: 0,
      width: element.clientWidth,
      height: element.clientHeight,
    };
  }

  useEffect(() => {
    const syncBounds = () => {
      setRect((current) => clampRect(current, getBounds(), minWidth, minHeight));
    };

    syncBounds();
    window.addEventListener("resize", syncBounds);
    return () => window.removeEventListener("resize", syncBounds);
  }, [containerRef, fixed, minHeight, minWidth]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const interaction = interactionRef.current;
      if (!interaction) return;

      const deltaX = event.clientX - interaction.startX;
      const deltaY = event.clientY - interaction.startY;
      const bounds = getBounds();

      setRect(() => {
        if (interaction.mode === "drag") {
          return clampRect(
            {
              ...interaction.startRect,
              x: interaction.startRect.x + deltaX,
              y: interaction.startRect.y + deltaY,
            },
            bounds,
            minWidth,
            minHeight,
          );
        }

        return clampRect(
          {
            ...interaction.startRect,
            width: interaction.startRect.width + deltaX,
            height: interaction.startRect.height + deltaY,
          },
          bounds,
          minWidth,
          minHeight,
        );
      });
    }

    function handlePointerUp() {
      interactionRef.current = null;
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [containerRef, fixed, minHeight, minWidth, rect.height, rect.width]);

  const style = fixed
    ? { left: rect.x, top: rect.y, width: rect.width, height: rect.height, position: "fixed" as const }
    : { left: rect.x, top: rect.y, width: rect.width, height: rect.height, position: "absolute" as const };

  return (
    <div
      className="overflow-hidden rounded-[22px] border-[3px] border-ink bg-[rgba(255,247,232,0.96)] shadow-[6px_6px_0_rgba(17,17,17,0.35)]"
      style={style}
    >
      <div
        className="flex cursor-move items-center justify-between border-b-2 border-ink/15 bg-[#ffe08e] px-3 py-2"
        onPointerDown={(event) => {
          interactionRef.current = {
            mode: "drag",
            startX: event.clientX,
            startY: event.clientY,
            startRect: rect,
          };
        }}
      >
        <span className="text-[11px] font-black uppercase tracking-[0.18em] text-ink">{title}</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-[#7a4d18]">Drag</span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border-2 border-ink bg-[var(--panel-cream)] px-2 py-1 text-[10px] font-black text-ink"
            >
              Close
            </button>
          )}
        </div>
      </div>

      <div className="flex h-[calc(100%-42px)] min-h-0 flex-col p-3">
        {children}
      </div>

      <button
        type="button"
        aria-label={`Resize ${title}`}
        className="absolute bottom-2 right-2 h-5 w-5 cursor-se-resize rounded-sm border-2 border-ink bg-opYellow"
        onPointerDown={(event) => {
          event.stopPropagation();
          interactionRef.current = {
            mode: "resize",
            startX: event.clientX,
            startY: event.clientY,
            startRect: rect,
          };
        }}
      />
    </div>
  );
}
