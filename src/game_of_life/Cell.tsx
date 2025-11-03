import React, { memo } from "react";
import { COLOR_GOLD } from "./constants.ts";

// Memoized cell component - only re-renders when filled state changes
export const Cell = memo(
  ({ x, y, filled }: { x: number; y: number; filled: boolean }) => (
    <div
      data-cell-x={x}
      data-cell-y={y}
      className={`gol-board-cell${filled ? " filled" : ""}`}
      style={
        filled
          ? {
              backgroundColor: `rgb(${COLOR_GOLD.r}, ${COLOR_GOLD.g}, ${COLOR_GOLD.b})`,
            }
          : undefined
      }
    />
  )
);
Cell.displayName = "Cell";
