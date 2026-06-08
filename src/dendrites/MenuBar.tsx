import React, { ReactElement, ReactNode } from "react";

type MenuBarProps = {
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
};

/** Fixed bar pinned to the bottom of the screen, layered above the canvas. */
export default function MenuBar({ open, onToggle, children }: MenuBarProps): ReactElement {
  return (
    <div className={`dendrites-menubar${open ? "" : " dendrites-menubar--hidden"}`}>
      <button
        className="dendrites-menu-handle"
        aria-label={open ? "Hide menu" : "Show menu"}
        aria-expanded={open}
        title={open ? "Hide menu" : "Show menu"}
        onClick={onToggle}
      >
        {open ? "▼" : "▲"}
      </button>
      {children}
    </div>
  );
}
